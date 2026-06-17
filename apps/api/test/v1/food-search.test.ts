import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

function expectOk<T>(env: Envelope<T>): T {
  expect(env.ok).toBe(true);
  if (!env.ok) throw new Error(`expected success, got ${env.code}`);
  return env.data;
}

describe("v1 food search + relog", () => {
  let ctx: TestContext;
  let cookie: string;
  let foodEntryId: string;
  let itemEntryId: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));

    foodEntryId = await createEntry("food_meal", "Meals");
    itemEntryId = await createEntry("food_item", "Library");

    // Log "Oatmeal" three times and "Chicken bowl" once.
    await logMeal("Oatmeal", 320, "2026-05-01T08:00:00.000Z");
    await logMeal("Oatmeal", 320, "2026-05-02T08:00:00.000Z");
    await logMeal("Oatmeal", 330, "2026-05-03T08:00:00.000Z");
    await logMeal("Chicken bowl", 540, "2026-05-03T13:00:00.000Z");

    // Save a reusable item with an alias.
    await logItem({
      name: "Greek yogurt",
      aliases: ["yogur griego"],
      kcal: 120,
      protein_g: 17,
      carbs_g: 7,
      fat_g: 0,
      defaultPortionG: 170,
      source: "manual",
    });
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

  async function logMeal(name: string, kcal: number, occurredAt: string): Promise<void> {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: {
        entryId: foodEntryId,
        occurredAt,
        payload: { name, kcal, protein_g: 10, carbs_g: 40, fat_g: 8, source: "manual", confidence: 1 },
        source: "web",
      },
    });
  }

  async function logItem(payload: Record<string, unknown>): Promise<void> {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: { entryId: itemEntryId, occurredAt: "2026-05-01T00:00:00.000Z", payload, source: "web" },
    });
  }

  it("dedupes repeated meals by name with a usage count", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/food/search?q=oat",
      headers: { cookie },
    });
    const data = expectOk(res.json() as Envelope<{ results: Array<{ name: string; usageCount: number; kind: string }> }>);
    const oatmeal = data.results.filter((r) => r.name === "Oatmeal");
    expect(oatmeal).toHaveLength(1);
    expect(oatmeal[0]!.usageCount).toBe(3);
    expect(oatmeal[0]!.kind).toBe("meal");
  });

  it("matches saved items by name and by alias, ranking items first", async () => {
    const byName = await ctx.app.inject({ method: "GET", url: "/api/v1/food/search?q=greek", headers: { cookie } });
    const nameData = expectOk(byName.json() as Envelope<{ results: Array<{ name: string; kind: string }> }>);
    expect(nameData.results[0]).toMatchObject({ name: "Greek yogurt", kind: "item" });

    const byAlias = await ctx.app.inject({ method: "GET", url: "/api/v1/food/search?q=griego", headers: { cookie } });
    const aliasData = expectOk(byAlias.json() as Envelope<{ results: Array<{ name: string }> }>);
    expect(aliasData.results.some((r) => r.name === "Greek yogurt")).toBe(true);
  });

  it("re-logs a previous meal as a new food event", async () => {
    const search = await ctx.app.inject({ method: "GET", url: "/api/v1/food/search?q=chicken", headers: { cookie } });
    const hit = expectOk(search.json() as Envelope<{ results: Array<{ eventId: string }> }>).results[0]!;

    const relog = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/food/relog",
      headers: { cookie },
      payload: { sourceEventId: hit.eventId, mealSlot: "dinner" },
    });
    expect(relog.statusCode).toBe(201);
    const relogData = expectOk(relog.json() as Envelope<{ name: string; kcal: number; mealSlot: string; eventId: string }>);
    expect(relogData.name).toBe("Chicken bowl");
    expect(relogData.kcal).toBe(540);
    expect(relogData.mealSlot).toBe("dinner");
  });

  it("scales macros by portion when re-logging a saved item", async () => {
    const search = await ctx.app.inject({ method: "GET", url: "/api/v1/food/search?q=greek", headers: { cookie } });
    const item = expectOk(search.json() as Envelope<{ results: Array<{ eventId: string }> }>).results[0]!;

    const relog = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/food/relog",
      headers: { cookie },
      payload: { sourceEventId: item.eventId, portionScale: 2 },
    });
    const data = expectOk(relog.json() as Envelope<{ kcal: number }>);
    expect(data.kcal).toBe(240);
  });

  it("returns 404 re-logging a non-existent source", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/food/relog",
      headers: { cookie },
      payload: { sourceEventId: "does-not-exist" },
    });
    expect(res.statusCode).toBe(404);
  });
});
