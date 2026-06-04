import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const NOW = "2026-07-15T12:00:00.000Z";

function unwrap<T>(res: { json: () => unknown }): T {
  const body = res.json() as Envelope<T>;
  if (!body.ok) throw new Error(`expected success, got ${JSON.stringify(body)}`);
  return body.data;
}

const meal = (kcal: number) => ({
  name: "Meal",
  kcal,
  protein_g: 10,
  carbs_g: 40,
  fat_g: 5,
  source: "manual",
  confidence: 1,
});

describe("v1 metric contests (B7c part 1)", () => {
  let ctx: TestContext;
  let cookie: string;
  let userId: string;
  let circleId: string;
  let circleToken: string;
  const circleAuth = () => ({ authorization: `Bearer ${circleToken}` });

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    const session = await signUp(ctx.app, { timezone: "UTC" });
    cookie = session.cookie;
    userId = session.body.user.id;

    circleId = unwrap<{ item: { id: string } }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/create",
        headers: { cookie },
        payload: { name: "Kcal Cup" },
      }),
    ).item.id;

    const entryId = unwrap<{ id: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/entries/create",
        headers: { cookie },
        payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
      }),
    ).id;

    for (const [day, kcal] of [
      ["2026-07-14", 500],
      ["2026-07-15", 300],
    ] as const) {
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/events/create",
        headers: { cookie },
        payload: { entryId, occurredAt: `${day}T08:00:00.000Z`, payload: meal(kcal), source: "web" },
      });
    }

    circleToken = unwrap<{ token: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/token/mint",
        headers: { cookie },
        payload: { circleId },
      }),
    ).token;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("rejects a metric-leaderboard read on a habit (non-metric) circle", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/circles/${circleId}/metric-leaderboard`,
      headers: circleAuth(),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("CONFLICT");
  });

  it("scores a cumulative kcal contest", async () => {
    const configured = unwrap<{ circle: { contestKind: string; metricMode: string | null } }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/contest/configure",
        headers: { cookie },
        payload: {
          circleId,
          contestKind: "metric",
          metricEntryTypeSlug: "food_meal",
          metricField: "kcal",
          metricMode: "cumulative",
          metricGoal: "higher",
        },
      }),
    );
    expect(configured.circle.contestKind).toBe("metric");
    expect(configured.circle.metricMode).toBe("cumulative");

    const lb = unwrap<{ leaderboard: { userId: string; score: number; rank: number; mode: string }[] }>(
      await ctx.app.inject({
        method: "GET",
        url: `/api/v1/circles/${circleId}/metric-leaderboard`,
        headers: { ...circleAuth(), "x-mikoshi-tracker-now": NOW },
      }),
    );
    const me = lb.leaderboard.find((r) => r.userId === userId);
    expect(me?.score).toBe(800);
    expect(me?.rank).toBe(1);
    expect(me?.mode).toBe("cumulative");
  });

  it("scores an adherence contest (days under a kcal target)", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/circles/contest/configure",
      headers: { cookie },
      payload: {
        circleId,
        contestKind: "metric",
        metricEntryTypeSlug: "food_meal",
        metricField: "kcal",
        metricMode: "adherence",
        metricTarget: 2000,
        metricGoal: "lower",
      },
    });

    const lb = unwrap<{ leaderboard: { userId: string; score: number }[] }>(
      await ctx.app.inject({
        method: "GET",
        url: `/api/v1/circles/${circleId}/metric-leaderboard`,
        headers: { ...circleAuth(), "x-mikoshi-tracker-now": NOW },
      }),
    );
    // Both logged days (500, 300 kcal) are under 2000 → 2 compliant days.
    expect(lb.leaderboard.find((r) => r.userId === userId)?.score).toBe(2);
  });

  it("rejects a metric config missing required fields", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/circles/contest/configure",
      headers: { cookie },
      payload: { circleId, contestKind: "metric", metricField: "kcal" },
    });
    expect(res.statusCode).toBe(400);
  });
});
