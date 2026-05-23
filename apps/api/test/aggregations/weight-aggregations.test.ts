import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

// 30-day date range: 2026-02-01 to 2026-03-02.
// User timezone: UTC (dateKey = UTC date of occurredAt).
// Weights vary between 77 and 82 kg with some missing days.
//
// Events (22 out of 30 days have a weight entry):
//   Missing days: Feb 03, Feb 07, Feb 11, Feb 15, Feb 19, Feb 22, Feb 26, Mar 02
//
// Week buckets (strftime '%Y-W%W', Feb 2 2026 is Monday of week 06):
//   Week 06: Feb 02, 04, 05, 06, 08 — 5 events
//   Week 07: Feb 09, 10, 12, 13, 14 — 5 events
//   Week 08: Feb 16, 17, 18, 20, 21 — 5 events
//   Week 09: Feb 23, 24, 25, 27, 28 — 5 events
//   Week 10: Mar 01 — 1 event (Mar 02 missing)

const EVENTS: Array<{ date: string; weight_kg: number }> = [
  { date: "2026-02-02", weight_kg: 82.0 },
  { date: "2026-02-04", weight_kg: 81.5 },
  { date: "2026-02-05", weight_kg: 81.0 },
  { date: "2026-02-06", weight_kg: 80.5 },
  { date: "2026-02-08", weight_kg: 80.0 },
  { date: "2026-02-09", weight_kg: 79.5 },
  { date: "2026-02-10", weight_kg: 79.0 },
  { date: "2026-02-12", weight_kg: 79.0 },
  { date: "2026-02-13", weight_kg: 78.5 },
  { date: "2026-02-14", weight_kg: 78.5 },
  { date: "2026-02-16", weight_kg: 78.0 },
  { date: "2026-02-17", weight_kg: 78.0 },
  { date: "2026-02-18", weight_kg: 77.5 },
  { date: "2026-02-20", weight_kg: 77.5 },
  { date: "2026-02-21", weight_kg: 77.5 },
  { date: "2026-02-23", weight_kg: 77.5 },
  { date: "2026-02-24", weight_kg: 77.0 },
  { date: "2026-02-25", weight_kg: 77.0 },
  { date: "2026-02-27", weight_kg: 77.0 },
  { date: "2026-02-28", weight_kg: 77.0 },
  { date: "2026-03-01", weight_kg: 77.0 },
];

const MISSING_DAYS = [
  "2026-02-03",
  "2026-02-07",
  "2026-02-11",
  "2026-02-15",
  "2026-02-19",
  "2026-02-22",
  "2026-02-26",
  "2026-03-02",
];

describe("weight_log aggregations", () => {
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
      payload: {
        entryTypeSlug: "weight_log",
        name: "Daily weight",
        config: {},
        startDate: "2026-02-02",
      },
    });
    expect(entryRes.statusCode).toBe(201);
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;

    for (const ev of EVENTS) {
      const res = await context!.app.inject({
        method: "POST",
        url: `/api/entries/${entryId}/events`,
        headers: { cookie },
        payload: {
          occurredAt: `${ev.date}T12:00:00.000Z`,
          payload: { weight_kg: ev.weight_kg, notes: null },
          source: "WEB",
        },
      });
      expect(res.statusCode).toBe(201);
    }

    return { cookie, entryId };
  }

  it("returns correct daily sum for weight_kg", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations?entryTypeSlug=weight_log&from=2026-02-02&to=2026-03-02&groupBy=day&fields=weight_kg",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      buckets: Array<{ key: { kind: string; value: string }; sum: { weight_kg: number } }>;
    };

    const feb02 = body.buckets.find((b) => b.key.value === "2026-02-02");
    expect(feb02).toBeDefined();
    expect(feb02!.sum.weight_kg).toBeCloseTo(82.0, 1);

    // Only days that have events appear when include=missing_days is NOT set
    expect(body.buckets.length).toBe(EVENTS.length);
  });

  it("counts missing_days correctly", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations?entryTypeSlug=weight_log&from=2026-02-02&to=2026-03-02&groupBy=day&fields=weight_kg&include=missing_days",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      buckets: Array<{ key: { kind: string; value: string }; sum: { weight_kg: number } }>;
      total: { count: number };
    };

    // All 29 days from Feb 02 to Mar 02 (inclusive) should appear when missing_days is included
    const totalDays = 29; // Feb: 27 days (02-28), March: 2 days (01-02) = 29
    expect(body.buckets.length).toBe(totalDays);

    // Missing days should have sum.weight_kg = 0
    const missingBuckets = body.buckets.filter((b) => MISSING_DAYS.includes(b.key.value));
    expect(missingBuckets.length).toBe(MISSING_DAYS.length);
    for (const mb of missingBuckets) {
      expect(mb.sum.weight_kg).toBe(0);
    }
  });

  it("groups by week and returns weekly averages", async () => {
    const { cookie } = await buildFixture();

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations?entryTypeSlug=weight_log&from=2026-02-02&to=2026-02-28&groupBy=week&fields=weight_kg",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      buckets: Array<{ key: { kind: string; value: string }; sum: { weight_kg: number }; count: number }>;
      weeklyAverage: { sum: { weight_kg: number }; count: number } | null;
    };

    // Should have 4 week buckets (weeks 06-09)
    expect(body.buckets.length).toBe(4);

    // weeklyAverage should be non-null for groupBy=week with ≥ 7 days
    expect(body.weeklyAverage).not.toBeNull();
    expect(body.weeklyAverage!.sum.weight_kg).toBeGreaterThan(0);
  });

  it("returns 404 for unknown entryTypeSlug", async () => {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations?entryTypeSlug=unknown_type&from=2026-01-01&to=2026-01-31&fields=weight_kg",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("respects per-user scoping — other user sees no data", async () => {
    const { cookie } = await buildFixture();
    void cookie; // fixture user — not checked here

    const { cookie: otherCookie } = await signUp(context!.app, {
      email: "bob@example.com",
      timezone: "UTC",
    });

    const res = await context!.app.inject({
      method: "GET",
      url: "/api/aggregations?entryTypeSlug=weight_log&from=2026-02-02&to=2026-03-02&fields=weight_kg",
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { total: { count: number } };
    expect(body.total.count).toBe(0);
  });
});
