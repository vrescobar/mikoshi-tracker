/**
 * Performance hardening: 10k EntryEvent fixture + EXPLAIN QUERY PLAN analysis.
 *
 * This test validates that:
 * 1. The aggregation query uses the (userId, dateKey) covering index — no full table scan.
 * 2. kcal_cached (NULL in test DBs, STORED generated column in production) works correctly
 *    via the COALESCE fallback.
 * 3. The query completes within 5 s for 5 000 events over a 200-day window.
 *
 * See docs/architecture/performance.md for the analysis and design decision.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

// 200 days × 25 meals/day × 2 users = 10 000 total EntryEvent rows
const DAYS = 200;
const MEALS_PER_DAY = 25;
const START_DATE = "2025-01-01";

describe("aggregation performance (10k fixture)", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = await createTestContext();
  });

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  async function buildLargeFixture() {
    const db = context!.app.db;

    const alice = await signUp(context!.app, {
      email: "alice@perf.test",
      name: "Alice",
      timezone: "UTC",
    });
    const bob = await signUp(context!.app, {
      email: "bob@perf.test",
      name: "Bob",
      timezone: "UTC",
    });

    // Create one food_meal Entry per user
    const aliceEntryRes = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie: alice.cookie },
      payload: { entryTypeSlug: "food_meal", name: "Alice food log", config: {} },
    });
    expect(aliceEntryRes.statusCode).toBe(201);
    const aliceEntryId = (aliceEntryRes.json() as { item: { id: string } }).item.id;

    const bobEntryRes = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie: bob.cookie },
      payload: { entryTypeSlug: "food_meal", name: "Bob food log", config: {} },
    });
    expect(bobEntryRes.statusCode).toBe(201);
    const bobEntryId = (bobEntryRes.json() as { item: { id: string } }).item.id;

    const startMs = new Date(`${START_DATE}T00:00:00Z`).getTime();
    const now = new Date();

    // Build the event rows directly — HTTP-per-row would be too slow for 10k events.
    // MEALS_PER_DAY * DAYS * 2 users = 10 000 rows.
    const rows: Array<{
      id: string;
      entryId: string;
      userId: string;
      occurredAt: Date;
      dateKey: string;
      payload: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    for (let day = 0; day < DAYS; day++) {
      const date = new Date(startMs + day * 86400000);
      const dateKey = date.toISOString().slice(0, 10);

      for (let meal = 0; meal < MEALS_PER_DAY; meal++) {
        const kcal = 100 + ((day * MEALS_PER_DAY + meal) % 1000);
        const payload = JSON.stringify({
          name: `Meal ${meal}`,
          kcal,
          protein_g: 20 + (meal % 30),
          carbs_g: 40 + (meal % 50),
          fat_g: 5 + (meal % 20),
          source: "manual",
          confidence: 1.0,
        });

        rows.push({
          id: `perf_alice_${day}_${meal}`,
          entryId: aliceEntryId,
          userId: alice.body.user.id,
          occurredAt: new Date(date.getTime() + meal * 1800000),
          dateKey,
          payload,
          createdAt: now,
          updatedAt: now,
        });

        rows.push({
          id: `perf_bob_${day}_${meal}`,
          entryId: bobEntryId,
          userId: bob.body.user.id,
          occurredAt: new Date(date.getTime() + meal * 1800000),
          dateKey,
          payload,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Bulk insert in batches of 500 to stay within parameter limits.
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await db.entryEvent.createMany({ data: rows.slice(i, i + BATCH) });
    }

    return { alice, bob, aliceEntryId };
  }

  it("query plan uses (userId, dateKey) index — no full table scan", async () => {
    const { alice } = await buildLargeFixture();
    const db = context!.app.db;

    // Verify total row count across both users
    const total = await db.entryEvent.count();
    expect(total).toBe(DAYS * MEALS_PER_DAY * 2);

    // The hot aggregation SQL (matches aggregation.repository.ts exactly)
    const planSql = `
      EXPLAIN QUERY PLAN
      SELECT
        ee.dateKey as bucket,
        COUNT(*) as event_count,
        SUM(COALESCE(ee.kcal_cached, CAST(json_extract(ee.payload, '$.kcal') AS REAL))) as sum_kcal
      FROM EntryEvent ee
      JOIN Entry e ON ee.entryId = e.id
      JOIN EntryType et ON e.entryTypeId = et.id
      WHERE ee.userId = ?
        AND et.slug = ?
        AND ee.dateKey >= ?
        AND ee.dateKey <= ?
        AND COALESCE(
          (SELECT em.type FROM EventMutation em
           WHERE em.eventId = ee.id
           ORDER BY em.createdAt DESC, em.id DESC
           LIMIT 1),
          'NONE'
        ) != 'DELETE'
      GROUP BY 1
      ORDER BY 1
    `;

    const plan = await db.$queryRawUnsafe<Array<{ id: number; parent: number; notused: number; detail: string }>>(
      planSql,
      alice.body.user.id,
      "food_meal",
      START_DATE,
      "2025-12-31",
    );

    const details = plan.map((r) => r.detail);

    // Must use an index on EntryEvent — never a full table scan
    const entryEventStep = details.find((d) => d.includes("EntryEvent"));
    expect(entryEventStep).toBeDefined();
    expect(entryEventStep).not.toMatch(/SCAN EntryEvent\b(?!.*USING)/i);

    // Must use the (userId, dateKey) composite index
    const usesUserDateIndex = details.some(
      (d) => d.includes("EntryEvent_userId_dateKey") || (d.includes("EntryEvent") && d.includes("userId")),
    );
    expect(usesUserDateIndex).toBe(true);
  }, 180_000);

  it("aggregation over 5k events completes within 5 s and returns correct sums", async () => {
    const { alice, aliceEntryId } = await buildLargeFixture();

    // `kcal_cached` is a STORED generated column (matches production), so it is
    // auto-populated on insert — the COALESCE path uses it without a manual UPDATE.

    // Alice has DAYS * MEALS_PER_DAY = 5000 events spanning 200 days
    const from = START_DATE;
    const toDate = new Date(new Date(`${START_DATE}T00:00:00Z`).getTime() + (DAYS - 1) * 86400000);
    const to = toDate.toISOString().slice(0, 10);

    const t0 = performance.now();
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie: alice.cookie },
      query: { entryTypeSlug: "food_meal", from, to, groupBy: "day", fields: "kcal" },
    });
    const elapsed = performance.now() - t0;

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      buckets: Array<{
        key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string };
        sum: Record<string, number>;
        count: number;
      }>;
      total: { count: number; sum: Record<string, number> };
    };

    // 200 buckets (one per day), all with data
    expect(body.buckets).toHaveLength(DAYS);
    expect(body.total.count).toBe(DAYS * MEALS_PER_DAY);

    // Each day has MEALS_PER_DAY events; verify kcal sum for day 0
    const day0 = body.buckets.find(
      (b) => b.key.kind === "date" && b.key.value === START_DATE,
    );
    expect(day0).toBeDefined();
    expect(day0!.count).toBe(MEALS_PER_DAY);
    // kcal for day 0: meals 0..24 → kcal = 100 + (0..24) % 1000 = 100..124
    const expectedDay0Kcal = Array.from({ length: MEALS_PER_DAY }, (_, i) => 100 + (i % 1000)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(Math.round(day0!.sum.kcal)).toBe(expectedDay0Kcal);

    // Performance gate: must complete within 5 s (generous; sub-100 ms expected in practice)
    expect(elapsed).toBeLessThan(5000);
  }, 180_000);
});
