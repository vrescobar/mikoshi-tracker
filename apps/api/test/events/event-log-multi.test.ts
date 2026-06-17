import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

function foodPayload(name: string, kcal: number) {
  return { name, kcal, protein_g: 5, carbs_g: 10, fat_g: 2, source: "manual", confidence: 0.8 };
}

async function createFoodEntry(context: TestContext, cookie: string): Promise<string> {
  const created = await context.app.inject({
    method: "POST",
    url: "/api/entries",
    headers: { cookie },
    payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { item: { id: string } }).item.id;
}

describe("event_log multiple events per day", () => {
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

  it("keeps every food_meal event on the same day distinct", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createFoodEntry(context!, cookie);

    const breakfast = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: foodPayload("Oatmeal", 320) },
    });
    const lunch = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T13:00:00.000Z", payload: foodPayload("Salad", 450) },
    });

    expect(breakfast.statusCode).toBe(201);
    expect(lunch.statusCode).toBe(201);

    const breakfastId = (breakfast.json() as { item: { id: string } }).item.id;
    const lunchId = (lunch.json() as { item: { id: string } }).item.id;
    expect(breakfastId).not.toBe(lunchId);

    // Each event_log event gets its own CREATE mutation
    expect((lunch.json() as { item: { mutations: Array<{ type: string }> } }).item.mutations
      .map((m) => m.type)).toEqual(["CREATE"]);

    const list = await context!.app.inject({
      method: "GET",
      url: `/api/events?entryId=${entryId}`,
      headers: { cookie },
    });
    const ids = (list.json() as { items: Array<{ id: string }> }).items.map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([breakfastId, lunchId]));
  });
});
