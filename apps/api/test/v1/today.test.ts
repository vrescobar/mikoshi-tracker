import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

describe("v1 today summary", () => {
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
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary" });
    expect(response.statusCode).toBe(401);
  });

  it("returns a today summary reflecting a freshly created habit", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug: "habit_boolean", name: "Stretch", config: { frequencyType: "DAILY" } },
    });
    const createdBody = created.json() as Envelope<{ id: string }>;
    if (!createdBody.ok) throw new Error("expected success");

    const summary = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary", headers: { cookie } });
    const body = summary.json() as Envelope<{ summary: { totalCount: number; pendingItems: { name: string }[] } }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    expect(body.data.summary.totalCount).toBeGreaterThanOrEqual(1);
    expect(body.data.summary.pendingItems.some((i) => i.name === "Stretch")).toBe(true);
  });

  it("omits the nutrition block for a habit-only user", async () => {
    const summary = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary", headers: { cookie } });
    const body = summary.json() as Envelope<{ summary: { nutrition: unknown } }>;
    expect(body.ok).toBe(true);
    // The signed-up user logs habits but no food → nutrition is null/absent.
    if (body.ok) expect(body.data.summary.nutrition ?? null).toBeNull();
  });

  it("includes a kcal roll-up once the user logs food today", async () => {
    // Pin "today" deterministically via the test-mode now header (default tz is
    // Asia/Shanghai; 12:00Z and an 08:00Z meal both fall on 2026-07-15 there).
    const NOW = "2026-07-15T12:00:00.000Z";
    const entry = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Meals", config: { dailyKcalTarget: 2000 } },
    });
    const entryBody = entry.json() as Envelope<{ id: string }>;
    if (!entryBody.ok) throw new Error("expected success");

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: {
        entryId: entryBody.data.id,
        occurredAt: "2026-07-15T08:00:00.000Z",
        payload: { name: "Oats", kcal: 500, protein_g: 10, carbs_g: 60, fat_g: 8, source: "manual", confidence: 1 },
        source: "web",
      },
    });

    const summary = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/today/summary",
      headers: { cookie, "x-mikoshi-tracker-now": NOW },
    });
    const body = summary.json() as Envelope<{
      summary: { nutrition: { kcal: number; kcalTarget: number | null; mealCount: number } | null };
    }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    expect(body.data.summary.nutrition).not.toBeNull();
    expect(body.data.summary.nutrition?.kcal).toBe(500);
    expect(body.data.summary.nutrition?.kcalTarget).toBe(2000);
    expect(body.data.summary.nutrition?.mealCount).toBe(1);
  });
});
