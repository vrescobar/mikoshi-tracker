import { afterEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

const NOW = "2026-05-10T12:00:00.000Z";

describe("chart routes", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  async function logMeal(cookie: string, entryId: string, kcal: number, occurredAt: string) {
    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: {
        occurredAt,
        payload: { name: "Meal", kcal, protein_g: 30, carbs_g: 40, fat_g: 10, mealSlot: "lunch", source: "manual", confidence: 1 },
      },
    });
  }

  it("requires authentication", async () => {
    context = await createTestContext();
    const res = await context.app.inject({ method: "GET", url: "/api/charts/kcal-trend.png" });
    expect(res.statusCode).toBe(401);
  });

  it("404s on an unknown chart kind", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { timezone: "UTC" });
    const res = await context.app.inject({ method: "GET", url: "/api/charts/bogus.png", headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("renders a kcal-trend PNG from the caller's meals", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { timezone: "UTC" });
    const entryRes = await context.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
    });
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;
    await logMeal(cookie, entryId, 500, "2026-05-09T12:00:00.000Z");
    await logMeal(cookie, entryId, 650, NOW);

    const res = await context.app.inject({
      method: "GET",
      url: "/api/charts/kcal-trend.png?range=7d",
      headers: { cookie, "x-mikoshi-tracker-now": NOW },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    const body = res.rawPayload;
    // PNG magic number.
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
    expect(body.length).toBeGreaterThan(1000);
  });

  it("renders a macro-donut PNG", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { timezone: "UTC" });
    const entryRes = await context.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
    });
    const entryId = (entryRes.json() as { item: { id: string } }).item.id;
    await logMeal(cookie, entryId, 700, NOW);

    const res = await context.app.inject({
      method: "GET",
      url: "/api/charts/macro-donut.png",
      headers: { cookie, "x-mikoshi-tracker-now": NOW },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.rawPayload[0]).toBe(0x89);
  });
});
