import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

// Fixture: 30 days × repeated meal names. We log:
//   - "Oatmeal"  6 times (kcal 320 each) → total 1920
//   - "Salad"    5 times (kcal 280 each) → total 1400
//   - "Chicken"  4 times (kcal 450 each) → total 1800
//   - "Pasta"    3 times (kcal 600 each) → total 1800
//   - "Soup"     2 times (kcal 200 each) → total  400
//   - "Pizza"    1 time  (kcal 800)      → total  800
// Total 21 events. Group by `name` should rank by event_count DESC.

type Meal = { name: string; kcal: number };

const MEALS: Array<Meal & { occurrences: number }> = [
  { name: "Oatmeal", kcal: 320, occurrences: 6 },
  { name: "Salad", kcal: 280, occurrences: 5 },
  { name: "Chicken", kcal: 450, occurrences: 4 },
  { name: "Pasta", kcal: 600, occurrences: 3 },
  { name: "Soup", kcal: 200, occurrences: 2 },
  { name: "Pizza", kcal: 800, occurrences: 1 },
];

describe("aggregations groupByPayload", () => {
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

    const entryRes = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Daily food", config: {} },
    });
    expect(entryRes.statusCode).toBe(201);
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;

    let dayCursor = new Date("2026-04-01T12:00:00.000Z");
    for (const meal of MEALS) {
      for (let i = 0; i < meal.occurrences; i += 1) {
        const res = await context!.app.inject({
          method: "POST",
          url: `/api/entries/${entryId}/events`,
          headers: { cookie },
          payload: {
            occurredAt: dayCursor.toISOString(),
            payload: {
              name: meal.name,
              kcal: meal.kcal,
              protein_g: 20,
              carbs_g: 40,
              fat_g: 10,
              source: "manual",
              confidence: 1.0,
            },
          },
        });
        expect(res.statusCode).toBe(201);
        dayCursor = new Date(dayCursor.getTime() + 86400000);
      }
    }

    return { cookie, entryId };
  }

  type Bucket = {
    key: { kind: "date"; value: string } | { kind: "payload"; field: string; value: string; sample?: unknown };
    sum: Record<string, number>;
    count: number;
    missing: boolean;
  };

  type AggResponse = {
    buckets: Bucket[];
    total: { sum: Record<string, number>; count: number };
    weeklyAverage: { sum: Record<string, number>; count: number } | null;
  };

  it("groups food meals by payload.name with sums + counts", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-04-01",
        to: "2026-05-31",
        groupByPayload: "name",
        fields: "kcal",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as AggResponse;

    expect(body.buckets).toHaveLength(6);
    expect(body.weeklyAverage).toBeNull();

    // All buckets carry kind: "payload"
    for (const bucket of body.buckets) {
      expect(bucket.key.kind).toBe("payload");
      if (bucket.key.kind === "payload") {
        expect(bucket.key.field).toBe("name");
      }
    }

    // Buckets are returned sorted by count DESC, ties broken by value ASC
    const firstBucket = body.buckets[0];
    expect(firstBucket?.key.kind).toBe("payload");
    if (firstBucket?.key.kind === "payload") {
      expect(firstBucket.key.value).toBe("oatmeal"); // lowercased by SQL
    }
    expect(firstBucket?.count).toBe(6);
    expect(firstBucket?.sum.kcal).toBe(6 * 320);

    // Tied counts (Pasta=3, Pizza=1) ranked properly: Chicken (4) before Pasta (3)
    const chicken = body.buckets.find(
      (b) => b.key.kind === "payload" && b.key.value === "chicken",
    );
    expect(chicken?.count).toBe(4);
    expect(chicken?.sum.kcal).toBe(4 * 450);

    // Totals span all 21 events
    expect(body.total.count).toBe(21);
    expect(body.total.sum.kcal).toBe(
      6 * 320 + 5 * 280 + 4 * 450 + 3 * 600 + 2 * 200 + 1 * 800,
    );
  });

  it("honors the limit parameter to cap the number of buckets", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-04-01",
        to: "2026-05-31",
        groupByPayload: "name",
        fields: "kcal",
        limit: "3",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as AggResponse;

    expect(body.buckets).toHaveLength(3);
    // Top 3 by count: Oatmeal (6), Salad (5), Chicken (4)
    expect(
      body.buckets.map((b) => (b.key.kind === "payload" ? b.key.value : null)),
    ).toEqual(["oatmeal", "salad", "chicken"]);
  });

  it("attaches a sample payload to each payload bucket", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-04-01",
        to: "2026-05-31",
        groupByPayload: "name",
        fields: "kcal",
        limit: "1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as AggResponse;

    const top = body.buckets[0];
    expect(top?.key.kind).toBe("payload");
    if (top?.key.kind === "payload") {
      expect(top.key.sample).toBeDefined();
      const sample = top.key.sample as { name: string; kcal: number };
      expect(sample.name).toBe("Oatmeal");
      expect(sample.kcal).toBe(320);
    }
  });

  it("rejects an invalid groupByPayload field name", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-04-01",
        to: "2026-05-31",
        groupByPayload: "'; DROP TABLE EntryEvent; --",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("excludes events whose payload field is null", async () => {
    const { cookie } = await buildFixture();

    // The fixture has 21 events all with name; no null-name events exist.
    // This test just sanity-asserts the HAVING clause doesn't emit an empty bucket.
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations",
      headers: { cookie },
      query: {
        entryTypeSlug: "food_meal",
        from: "2026-04-01",
        to: "2026-05-31",
        groupByPayload: "name",
        fields: "kcal",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as AggResponse;
    for (const bucket of body.buckets) {
      if (bucket.key.kind === "payload") {
        expect(bucket.key.value).not.toBe("");
      }
    }
  });
});
