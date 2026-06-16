import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

function expectOk<T>(env: Envelope<T>): T {
  expect(env.ok).toBe(true);
  if (!env.ok) throw new Error(`expected success, got ${env.code}`);
  return env.data;
}

describe("v1 diet goal + preferences", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("rejects unauthenticated calls", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/goal" });
    expect(response.statusCode).toBe(401);
  });

  it("returns null before any goal is set", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/goal", headers: { cookie } });
    const data = expectOk(res.json() as Envelope<{ goal: unknown }>);
    expect(data.goal).toBeNull();
  });

  it("sets a goal and reads it back as the active revision", async () => {
    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/diet/goal",
      headers: { cookie },
      payload: {
        kcalTarget: 2100,
        proteinTargetG: 160,
        objective: "maintain",
        breakfastKcal: 500,
        source: "manual",
      },
    });
    const setData = expectOk(set.json() as Envelope<{ goal: { kcalTarget: number; eventId: string | null } }>);
    expect(setData.goal.kcalTarget).toBe(2100);
    expect(setData.goal.eventId).not.toBeNull();

    const get = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/goal", headers: { cookie } });
    const getData = expectOk(get.json() as Envelope<{ goal: { kcalTarget: number; objective: string } }>);
    expect(getData.goal.kcalTarget).toBe(2100);
    expect(getData.goal.objective).toBe("maintain");
  });

  it("a second revision supersedes the first", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/diet/goal",
      headers: { cookie },
      payload: { kcalTarget: 1800, source: "manual" },
    });
    const get = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/goal", headers: { cookie } });
    const data = expectOk(get.json() as Envelope<{ goal: { kcalTarget: number } }>);
    expect(data.goal.kcalTarget).toBe(1800);
  });

  it("rejects an invalid goal (non-positive kcal)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/diet/goal",
      headers: { cookie },
      payload: { kcalTarget: 0 },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("stores and returns dietary preferences", async () => {
    const empty = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/preferences", headers: { cookie } });
    expect(expectOk(empty.json() as Envelope<{ preferences: Record<string, unknown> }>).preferences).toEqual({});

    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/diet/preferences",
      headers: { cookie },
      payload: { allergies: ["peanuts"], dislikes: ["cilantro"], units: "metric", defaultMealSlot: "lunch" },
    });
    const setData = expectOk(
      set.json() as Envelope<{ preferences: { allergies: string[]; units: string } }>,
    );
    expect(setData.preferences.allergies).toEqual(["peanuts"]);
    expect(setData.preferences.units).toBe("metric");

    const get = await ctx.app.inject({ method: "GET", url: "/api/v1/diet/preferences", headers: { cookie } });
    const getData = expectOk(get.json() as Envelope<{ preferences: { dislikes: string[] } }>);
    expect(getData.preferences.dislikes).toEqual(["cilantro"]);
  });
});
