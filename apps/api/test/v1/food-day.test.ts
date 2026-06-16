import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

function expectOk<T>(env: Envelope<T>): T {
  expect(env.ok).toBe(true);
  if (!env.ok) throw new Error(`expected success, got ${env.code}`);
  return env.data;
}

// 1×1 transparent PNG (same fixture the attachment route documents).
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type DayMeal = {
  eventId: string;
  occurredAt: string;
  source: string | null;
  payload: { name: string; kcal: number; mealSlot?: string | null };
  attachments: Array<{ id: string; url: string }>;
};
type DayResponse = {
  date: string;
  meals: DayMeal[];
  nutrition: { kcal: number; mealCount: number } | null;
};

describe("v1 GET /food/day", () => {
  let ctx: TestContext;
  let cookie: string;
  let foodEntryId: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    // Force UTC so wall-clock slot inference is deterministic in the test.
    ({ cookie } = await signUp(ctx.app, { timezone: "UTC" }));
    foodEntryId = await createEntry("food_meal", "Meals");
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  async function createEntry(entryTypeSlug: string, name: string): Promise<string> {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug, name, config: {} },
    });
    return expectOk(res.json() as Envelope<{ id: string }>).id;
  }

  async function logMeal(payload: Record<string, unknown>, occurredAt: string): Promise<string> {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: { entryId: foodEntryId, occurredAt, payload, source: "web" },
    });
    return expectOk(res.json() as Envelope<{ id: string }>).id;
  }

  it("infers the meal slot from time and respects explicit slots", async () => {
    await logMeal(
      { name: "Lunchtime bowl", kcal: 600, protein_g: 30, carbs_g: 60, fat_g: 20, source: "manual", confidence: 1 },
      "2026-06-16T13:00:00.000Z",
    );
    await logMeal(
      {
        name: "Late brunch",
        kcal: 400,
        protein_g: 20,
        carbs_g: 40,
        fat_g: 12,
        mealSlot: "dinner", // explicit → must be preserved even though it's morning
        source: "manual",
        confidence: 1,
      },
      "2026-06-16T08:00:00.000Z",
    );

    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/food/day?date=2026-06-16", headers: { cookie } });
    const data = expectOk(res.json() as Envelope<DayResponse>);

    expect(data.date).toBe("2026-06-16");
    expect(data.meals).toHaveLength(2);
    const byName = Object.fromEntries(data.meals.map((m) => [m.payload.name, m]));
    expect(byName["Lunchtime bowl"]!.payload.mealSlot).toBe("lunch"); // inferred
    expect(byName["Late brunch"]!.payload.mealSlot).toBe("dinner"); // explicit kept
    expect(byName["Lunchtime bowl"]!.source).toBe("WEB");
  });

  it("rolls up nutrition for the day", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/food/day?date=2026-06-16", headers: { cookie } });
    const data = expectOk(res.json() as Envelope<DayResponse>);
    expect(data.nutrition).not.toBeNull();
    expect(data.nutrition!.kcal).toBe(1000);
    expect(data.nutrition!.mealCount).toBe(2);
  });

  it("surfaces photo attachments on the meal", async () => {
    const eventId = await logMeal(
      { name: "Photo meal", kcal: 250, protein_g: 10, carbs_g: 30, fat_g: 8, source: "manual", confidence: 1 },
      "2026-06-16T19:30:00.000Z",
    );
    const upload = await ctx.app.inject({
      method: "POST",
      url: "/api/attachments/event",
      headers: { cookie },
      payload: { eventId, data: PNG_1PX, originalName: "meal.png" },
    });
    expect(upload.statusCode).toBe(201);

    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/food/day?date=2026-06-16", headers: { cookie } });
    const data = expectOk(res.json() as Envelope<DayResponse>);
    const meal = data.meals.find((m) => m.payload.name === "Photo meal")!;
    expect(meal.attachments).toHaveLength(1);
    expect(meal.attachments[0]!.url).toContain("/api/attachments/");
    expect(meal.payload.mealSlot).toBe("dinner"); // 19:30 → dinner
  });

  it("defaults the date to the user's today when omitted", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/food/day", headers: { cookie } });
    const data = expectOk(res.json() as Envelope<DayResponse>);
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
