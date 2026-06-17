import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

const NOW = "2026-04-01T12:00:00.000Z";
const TODAY = "2026-04-01";

describe("today nutrition — diet goal", () => {
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

  async function createEntry(cookie: string, entryTypeSlug: string) {
    const res = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: { entryTypeSlug, name: entryTypeSlug, config: {} },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { item: { id: string } }).item.id;
  }

  async function logEvent(cookie: string, entryId: string, payload: Record<string, unknown>) {
    const res = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: NOW, payload },
    });
    expect(res.statusCode).toBe(201);
  }

  it("surfaces the active diet goal's targets and per-slot progress on /api/today", async () => {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });

    const foodId = await createEntry(cookie, "food_meal");
    await logEvent(cookie, foodId, {
      name: "Oats",
      kcal: 400,
      protein_g: 20,
      carbs_g: 60,
      fat_g: 10,
      mealSlot: "breakfast",
      source: "manual",
      confidence: 1,
    });
    await logEvent(cookie, foodId, {
      name: "Bowl",
      kcal: 600,
      protein_g: 40,
      carbs_g: 50,
      fat_g: 20,
      mealSlot: "lunch",
      source: "manual",
      confidence: 1,
    });

    const goalId = await createEntry(cookie, "diet_goal");
    await logEvent(cookie, goalId, {
      kcalTarget: 2000,
      proteinTargetG: 150,
      carbsTargetG: 200,
      fatTargetG: 60,
      objective: "maintain",
      breakfastKcal: 500,
      source: "manual",
    });

    const response = await context!.app.inject({
      method: "GET",
      url: "/api/today",
      headers: { cookie, "x-mikoshi-tracker-now": NOW },
    });

    expect(response.statusCode).toBe(200);
    const nutrition = (response.json() as { summary: { nutrition: Record<string, unknown> } }).summary.nutrition;

    expect(nutrition).toMatchObject({
      kcal: 1000,
      mealCount: 2,
      kcalTarget: 2000,
      proteinTargetG: 150,
      carbsTargetG: 200,
      fatTargetG: 60,
      objective: "maintain",
    });

    const bySlot = nutrition.bySlot as Array<{ slot: string; kcal: number; kcalTarget: number | null }>;
    const breakfast = bySlot.find((s) => s.slot === "breakfast");
    const lunch = bySlot.find((s) => s.slot === "lunch");
    expect(breakfast).toEqual({ slot: "breakfast", kcal: 400, kcalTarget: 500 });
    expect(lunch).toEqual({ slot: "lunch", kcal: 600, kcalTarget: null });
  });

  it("falls back to the latest goal revision and ignores deleted ones", async () => {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });
    await createEntry(cookie, "food_meal").then((foodId) =>
      logEvent(cookie, foodId, {
        name: "Snack",
        kcal: 100,
        protein_g: 1,
        carbs_g: 1,
        fat_g: 1,
        source: "manual",
        confidence: 1,
      }),
    );

    const goalId = await createEntry(cookie, "diet_goal");
    // Two revisions on the same day; latest (occurredAt tiebreak by createdAt) wins.
    await logEvent(cookie, goalId, { kcalTarget: 1800, source: "manual" });
    await logEvent(cookie, goalId, { kcalTarget: 2200, source: "manual" });

    const response = await context!.app.inject({
      method: "GET",
      url: "/api/today",
      headers: { cookie, "x-mikoshi-tracker-now": NOW },
    });

    const nutrition = (response.json() as { summary: { nutrition: { kcalTarget: number } } }).summary.nutrition;
    expect(nutrition.kcalTarget).toBe(2200);
    expect(TODAY).toBe("2026-04-01");
  });
});
