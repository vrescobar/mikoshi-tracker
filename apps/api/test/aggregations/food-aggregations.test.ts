import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

// 14-day date range: 2026-01-05 to 2026-01-18.
// Jan 1 2026 is Thursday, so:
//   Week 01 (strftime '%Y-W%W'): Jan 5 (Mon) – Jan 11 (Sun)
//   Week 02                    : Jan 12 (Mon) – Jan 18 (Sun)
//
// Events (UTC timezone user, so dateKey = UTC date of occurredAt):
//   Jan  5 : kcal=500  protein_g=30  carbs_g=60  fat_g=10
//   Jan  6 : kcal=600  protein_g=35  carbs_g=70  fat_g=12
//   Jan  7 : (missing)
//   Jan  8 : kcal=400  protein_g=25  carbs_g=50  fat_g=8
//   Jan  9 : kcal=700  protein_g=40  carbs_g=80  fat_g=15
//   Jan 10 : kcal=300  protein_g=20  carbs_g=40  fat_g=6
//   Jan 11 : (missing)
//   Jan 12 : kcal=550  protein_g=32  carbs_g=65  fat_g=11
//   Jan 13 : kcal=650  protein_g=38  carbs_g=75  fat_g=13
//   Jan 14 : (missing)
//   Jan 15 : kcal=450  protein_g=28  carbs_g=55  fat_g=9
//   Jan 16 : kcal=750  protein_g=42  carbs_g=85  fat_g=16
//   Jan 17 : kcal=350  protein_g=22  carbs_g=45  fat_g=7
//   Jan 18 : (missing)
//
// Week 01 totals (5 events): kcal=2500  protein_g=150  carbs_g=300  fat_g=51
// Week 02 totals (5 events): kcal=2750  protein_g=162  carbs_g=325  fat_g=56
// Grand total  (10 events) : kcal=5250  protein_g=312  carbs_g=625  fat_g=107
// Weekly avg (÷ 2)         : kcal=2625  protein_g=156  carbs_g=312.5  fat_g=53.5

const EVENTS: Array<{
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}> = [
  { date: "2026-01-05", kcal: 500, protein_g: 30, carbs_g: 60, fat_g: 10 },
  { date: "2026-01-06", kcal: 600, protein_g: 35, carbs_g: 70, fat_g: 12 },
  { date: "2026-01-08", kcal: 400, protein_g: 25, carbs_g: 50, fat_g: 8 },
  { date: "2026-01-09", kcal: 700, protein_g: 40, carbs_g: 80, fat_g: 15 },
  { date: "2026-01-10", kcal: 300, protein_g: 20, carbs_g: 40, fat_g: 6 },
  { date: "2026-01-12", kcal: 550, protein_g: 32, carbs_g: 65, fat_g: 11 },
  { date: "2026-01-13", kcal: 650, protein_g: 38, carbs_g: 75, fat_g: 13 },
  { date: "2026-01-15", kcal: 450, protein_g: 28, carbs_g: 55, fat_g: 9 },
  { date: "2026-01-16", kcal: 750, protein_g: 42, carbs_g: 85, fat_g: 16 },
  { date: "2026-01-17", kcal: 350, protein_g: 22, carbs_g: 45, fat_g: 7 },
];

const MISSING_DAYS = ["2026-01-07", "2026-01-11", "2026-01-14", "2026-01-18"];

describe("food aggregations", () => {
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

  async function buildFixture() {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });

    // Create a food entry
    const entryRes = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Daily food", config: {} },
    });
    expect(entryRes.statusCode).toBe(201);
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;

    // Create one event per day from EVENTS list
    for (const ev of EVENTS) {
      const res = await context!.app.inject({
        method: "POST",
        url: `/api/entries/${entryId}/events`,
        headers: { cookie },
        payload: {
          occurredAt: `${ev.date}T12:00:00.000Z`,
          payload: {
            name: "Test meal",
            kcal: ev.kcal,
            protein_g: ev.protein_g,
            carbs_g: ev.carbs_g,
            fat_g: ev.fat_g,
            source: "manual",
            confidence: 1.0,
          },
        },
      });
      expect(res.statusCode).toBe(201);
    }

    return { cookie, entryId };
  }

  it("returns correct daily sums with missing buckets", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
        include: "missing_days",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      buckets: Array<{
        key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string };
        sum: Record<string, number>;
        count: number;
        missing: boolean;
      }>;
      total: { sum: Record<string, number>; count: number };
      weeklyAverage: { sum: Record<string, number>; count: number } | null;
    };

    // 14 buckets total (10 with data + 4 missing)
    expect(body.buckets).toHaveLength(14);

    // Sanity-check the discriminated union: every bucket should be a date bucket here.
    expect(body.buckets.every((b) => b.key.kind === "date")).toBe(true);

    const valueOf = (b: (typeof body.buckets)[number]) =>
      b.key.kind === "date" ? b.key.value : "";

    // Verify missing days are marked correctly
    for (const day of MISSING_DAYS) {
      const bucket = body.buckets.find((b) => valueOf(b) === day);
      expect(bucket, `${day} should be present as missing`).toBeDefined();
      expect(bucket?.missing).toBe(true);
      expect(bucket?.count).toBe(0);
    }

    // Verify a few specific daily sums
    const jan5 = body.buckets.find((b) => valueOf(b) === "2026-01-05");
    expect(jan5?.missing).toBe(false);
    expect(jan5?.count).toBe(1);
    expect(jan5?.sum.kcal).toBe(500);
    expect(jan5?.sum.protein_g).toBe(30);

    const jan16 = body.buckets.find((b) => valueOf(b) === "2026-01-16");
    expect(jan16?.missing).toBe(false);
    expect(jan16?.sum.kcal).toBe(750);

    // Verify totals
    expect(body.total.count).toBe(10);
    expect(body.total.sum.kcal).toBe(5250);
    expect(body.total.sum.protein_g).toBe(312);
    expect(body.total.sum.carbs_g).toBe(625);
    expect(body.total.sum.fat_g).toBe(107);

    // Weekly average (14 days = 2 weeks)
    expect(body.weeklyAverage).not.toBeNull();
    expect(body.weeklyAverage?.count).toBe(5);
    expect(body.weeklyAverage?.sum.kcal).toBe(2625);
  });

  it("returns correct weekly counts and sums", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "week",
        fields: "kcal",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      buckets: Array<{
        key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string };
        sum: Record<string, number>;
        count: number;
        missing: boolean;
      }>;
      total: { sum: Record<string, number>; count: number };
      weeklyAverage: { sum: Record<string, number>; count: number } | null;
    };

    // 2 week buckets
    expect(body.buckets).toHaveLength(2);

    const valueOf = (b: (typeof body.buckets)[number]) =>
      b.key.kind === "date" ? b.key.value : "";
    const w01 = body.buckets.find((b) => valueOf(b) === "2026-W01");
    const w02 = body.buckets.find((b) => valueOf(b) === "2026-W02");

    expect(w01).toBeDefined();
    expect(w01?.count).toBe(5);
    expect(w01?.sum.kcal).toBe(2500);
    expect(w01?.missing).toBe(false);

    expect(w02).toBeDefined();
    expect(w02?.count).toBe(5);
    expect(w02?.sum.kcal).toBe(2750);
    expect(w02?.missing).toBe(false);

    // Weekly average
    expect(body.weeklyAverage).not.toBeNull();
    expect(body.weeklyAverage?.count).toBe(5);
    expect(body.weeklyAverage?.sum.kcal).toBe(2625);
  });

  it("returns correct weekly average over the range", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
        fields: "kcal",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      weeklyAverage: { sum: Record<string, number>; count: number } | null;
    };

    // 14 days / 2 weeks: count avg = round(10/2) = 5, kcal avg = 5250/2 = 2625
    expect(body.weeklyAverage?.count).toBe(5);
    expect(body.weeklyAverage?.sum.kcal).toBe(2625);
  });

  it("emits missing_days when requested and not otherwise", async () => {
    const { cookie } = await buildFixture();

    // Without include=missing_days: only 10 buckets
    const withoutMissing = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
      },
    });
    expect(withoutMissing.statusCode).toBe(200);
    const noMissingBody = withoutMissing.json() as { buckets: unknown[] };
    expect(noMissingBody.buckets).toHaveLength(10);

    // With include=missing_days: 14 buckets
    const withMissing = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
        include: "missing_days",
      },
    });
    expect(withMissing.statusCode).toBe(200);
    const missingBody = withMissing.json() as {
      buckets: Array<{
        key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string };
        missing: boolean;
      }>;
    };
    expect(missingBody.buckets).toHaveLength(14);

    const missingBuckets = missingBody.buckets.filter((b) => b.missing);
    expect(missingBuckets).toHaveLength(4);
    expect(
      missingBuckets.map((b) => (b.key.kind === "date" ? b.key.value : "")).sort(),
    ).toEqual(MISSING_DAYS.sort());
  });

  it("returns null weeklyAverage for groupBy=none", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "none",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      buckets: Array<{
        key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string };
        count: number;
      }>;
      total: { count: number; sum: Record<string, number> };
      weeklyAverage: null;
    };

    // Single "total" bucket
    expect(body.buckets).toHaveLength(1);
    expect(body.buckets[0]?.key).toEqual({ kind: "date", value: "total" });
    expect(body.buckets[0]?.count).toBe(10);

    expect(body.total.count).toBe(10);
    expect(body.total.sum.kcal).toBe(5250);
    expect(body.weeklyAverage).toBeNull();
  });

  it("excludes deleted events from aggregation", async () => {
    const { cookie } = await buildFixture();

    // Get the Jan 5 event id
    const listRes = await context!.app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie },
      query: { from: "2026-01-05", to: "2026-01-05" },
    });
    expect(listRes.statusCode).toBe(200);
    const jan5Event = (listRes.json() as { items: Array<{ id: string; dateKey: string }> }).items.find(
      (e) => e.dateKey === "2026-01-05",
    );
    expect(jan5Event).toBeDefined();

    // Delete it
    await context!.app.inject({
      method: "DELETE",
      url: `/api/events/${jan5Event!.id}`,
      headers: { cookie },
    });

    // Re-query aggregation: Jan 5 should be gone from sums
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-05",
        groupBy: "day",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { buckets: unknown[]; total: { count: number } };
    // No buckets returned (deleted event not counted) and total count = 0
    expect(body.buckets).toHaveLength(0);
    expect(body.total.count).toBe(0);
  });

  it("returns 404 for unknown entryTypeSlug", async () => {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "nonexistent_type",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-18",
        groupBy: "day",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("scopes aggregations to the authenticated user", async () => {
    const alice = await signUp(context!.app, { timezone: "UTC" });
    const bob = await signUp(context!.app, {
      email: "bob@example.com",
      name: "Bob",
      timezone: "UTC",
    });

    // Alice creates events
    const entryRes = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie: alice.cookie },
      payload: { entryTypeSlug: "food_meal", name: "Alice food", config: {} },
    });
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;

    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie: alice.cookie },
      payload: {
        occurredAt: "2026-01-05T12:00:00.000Z",
        payload: {
          name: "Alice meal",
          kcal: 1000,
          protein_g: 50,
          carbs_g: 100,
          fat_g: 20,
          source: "manual",
          confidence: 1.0,
        },
      },
    });

    // Bob queries — should see 0 events
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie: bob.cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-01-05",
        to: "2026-01-05",
        groupBy: "day",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: { count: number } };
    expect(body.total.count).toBe(0);
  });
});
