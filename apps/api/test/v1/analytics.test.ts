import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const FOOD = (kcal: number) => ({
  name: "Oats",
  kcal,
  protein_g: 5,
  carbs_g: 30,
  fat_g: 3,
  source: "manual",
  confidence: 1,
});

describe("v1 aggregations + stats", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
    });
    const body = created.json() as Envelope<{ id: string }>;
    if (!body.ok) throw new Error("expected entry success");
    const entryId = body.data.id;

    for (const [day, kcal] of [
      ["2026-05-20", 400],
      ["2026-05-20", 200],
      ["2026-05-22", 600],
    ] as const) {
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/events/create",
        headers: { cookie },
        payload: { entryId, occurredAt: `${day}T08:00:00.000Z`, payload: FOOD(kcal), source: "web" },
      });
    }
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("aggregates kcal per day and fills missing days when requested", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/aggregations?entryTypeSlug=food_meal&from=2026-05-20&to=2026-05-22&groupBy=day&include=missing_days&fields=kcal",
      headers: { cookie },
    });
    const body = res.json() as Envelope<{
      buckets: { key: { value: string }; sum: { kcal: number }; missing: boolean }[];
      total: { sum: { kcal: number } };
    }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    expect(body.data.total.sum.kcal).toBe(1200);
    const may20 = body.data.buckets.find((b) => b.key.value === "2026-05-20");
    const may21 = body.data.buckets.find((b) => b.key.value === "2026-05-21");
    expect(may20?.sum.kcal).toBe(600);
    expect(may21?.missing).toBe(true);
  });

  it("groups by a payload field", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/aggregations?entryTypeSlug=food_meal&from=2026-05-20&to=2026-05-22&groupByPayload=name&fields=kcal",
      headers: { cookie },
    });
    const body = res.json() as Envelope<{ buckets: { key: { value: string } }[] }>;
    expect(body.ok).toBe(true);
    // The payload-group bucket value is normalized to lowercase by the query.
    if (body.ok) expect(body.data.buckets.some((b) => b.key.value === "oats")).toBe(true);
  });

  it("returns a 30-day overview with metrics and trends", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/stats/overview", headers: { cookie } });
    const body = res.json() as Envelope<{
      metrics: { activeHabitCount: number };
      trends: { last7Days: unknown[]; last30Days: unknown[] };
    }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    expect(body.data.trends.last7Days).toHaveLength(7);
    expect(body.data.trends.last30Days).toHaveLength(30);
  });

  it("rejects an aggregation for an unknown entry type", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/aggregations?entryTypeSlug=does_not_exist&from=2026-05-20&to=2026-05-22",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("NOT_FOUND");
  });
});
