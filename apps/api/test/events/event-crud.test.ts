import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

const FOOD_PAYLOAD = {
  name: "Oatmeal",
  kcal: 320,
  protein_g: 12,
  carbs_g: 55,
  fat_g: 6,
  source: "manual",
  confidence: 0.9,
};

async function createFoodEntry(context: TestContext, cookie: string): Promise<string> {
  const created = await context.app.inject({
    method: "POST",
    url: "/api/entries",
    headers: { cookie },
    payload: { entryTypeSlug: "food_meal", name: "Breakfast", config: {} },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { item: { id: string } }).item.id;
}

describe("events CRUD", () => {
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

  it("creates, gets, lists, updates, deletes, and undoes a food_meal event", async () => {
    const { body, cookie } = await signUp(context!.app);
    const entryId = await createFoodEntry(context!, cookie);

    const createResponse = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: FOOD_PAYLOAD },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item: { id: string; entryId: string; userId: string; mutations: Array<{ type: string }> };
    };
    expect(created.item).toMatchObject({ entryId, userId: body.user.id });
    expect(created.item.mutations.map((m) => m.type)).toEqual(["CREATE"]);
    const eventId = created.item.id;

    const getResponse = await context!.app.inject({
      method: "GET",
      url: `/api/events/${eventId}`,
      headers: { cookie },
    });
    expect(getResponse.statusCode).toBe(200);
    expect((getResponse.json() as { item: { id: string } }).item.id).toBe(eventId);

    const listResponse = await context!.app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie },
    });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json() as { items: Array<{ id: string }>; hasMore: boolean };
    expect(list.items.map((e) => e.id)).toContain(eventId);

    const updateResponse = await context!.app.inject({
      method: "PATCH",
      url: `/api/events/${eventId}`,
      headers: { cookie },
      payload: { payload: { ...FOOD_PAYLOAD, kcal: 400 }, note: "fixed kcal" },
    });
    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json() as {
      item: { payload: { kcal: number }; mutations: Array<{ type: string }> };
    };
    expect(updated.item.payload.kcal).toBe(400);
    expect(updated.item.mutations.map((m) => m.type)).toEqual(["CREATE", "UPDATE"]);

    const undoResponse = await context!.app.inject({
      method: "POST",
      url: `/api/events/${eventId}/undo`,
      headers: { cookie },
    });
    expect(undoResponse.statusCode).toBe(200);
    const undone = undoResponse.json() as {
      item: { payload: { kcal: number }; mutations: Array<{ type: string }> };
    };
    expect(undone.item.payload.kcal).toBe(320);
    expect(undone.item.mutations.map((m) => m.type)).toEqual(["CREATE", "UPDATE", "UNDO"]);

    const deleteResponse = await context!.app.inject({
      method: "DELETE",
      url: `/api/events/${eventId}`,
      headers: { cookie },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({ eventId });

    const listAfterDelete = await context!.app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie },
    });
    expect((listAfterDelete.json() as { items: Array<{ id: string }> }).items.map((e) => e.id))
      .not.toContain(eventId);

    const doubleDelete = await context!.app.inject({
      method: "DELETE",
      url: `/api/events/${eventId}`,
      headers: { cookie },
    });
    expect(doubleDelete.statusCode).toBe(409);
    expect(doubleDelete.json()).toMatchObject({ code: "EVENT_DELETED" });
  });

  it("edits a meal's time (occurredAt) and recomputes its day bucket", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createFoodEntry(context!, cookie);

    const createResponse = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: FOOD_PAYLOAD },
    });
    const eventId = (createResponse.json() as { item: { id: string; dateKey: string } }).item.id;

    // Move it to the previous day, no payload change. The default user timezone
    // is Asia/Shanghai (UTC+8), so 2026-05-19T20:00Z = 2026-05-20 04:00 local.
    const moved = await context!.app.inject({
      method: "PATCH",
      url: `/api/events/${eventId}`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-19T20:00:00.000Z" },
    });
    expect(moved.statusCode).toBe(200);
    const item = (moved.json() as {
      item: { occurredAt: string; dateKey: string; payload: { kcal: number }; mutations: Array<{ type: string }> };
    }).item;
    expect(item.occurredAt).toBe("2026-05-19T20:00:00.000Z");
    expect(item.dateKey).toBe("2026-05-20"); // recomputed from the new time (local day)
    expect(item.payload.kcal).toBe(FOOD_PAYLOAD.kcal); // payload untouched
    expect(item.mutations.map((m) => m.type)).toEqual(["CREATE", "UPDATE"]);
  });

  it("returns 404 when posting to a missing entry and reading a missing event", async () => {
    const { cookie } = await signUp(context!.app);

    const postMissing = await context!.app.inject({
      method: "POST",
      url: "/api/entries/missing-entry/events",
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: FOOD_PAYLOAD },
    });
    expect(postMissing.statusCode).toBe(404);

    const getMissing = await context!.app.inject({
      method: "GET",
      url: "/api/events/missing-event",
      headers: { cookie },
    });
    expect(getMissing.statusCode).toBe(404);
  });

  it("rejects events on archived entries", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createFoodEntry(context!, cookie);

    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/archive`,
      headers: { cookie },
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: FOOD_PAYLOAD },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "ENTRY_INACTIVE" });
  });

  it("scopes events to the authenticated user", async () => {
    const alice = await signUp(context!.app);
    const bob = await signUp(context!.app, { email: "bob@example.com", name: "Bob" });

    const entryId = await createFoodEntry(context!, alice.cookie);
    const created = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie: alice.cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: FOOD_PAYLOAD },
    });
    const eventId = (created.json() as { item: { id: string } }).item.id;

    const bobGet = await context!.app.inject({
      method: "GET",
      url: `/api/events/${eventId}`,
      headers: { cookie: bob.cookie },
    });
    expect(bobGet.statusCode).toBe(404);

    const bobList = await context!.app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: bob.cookie },
    });
    expect((bobList.json() as { items: unknown[] }).items).toEqual([]);

    const unauth = await context!.app.inject({ method: "GET", url: "/api/events" });
    expect(unauth.statusCode).toBe(401);
  });
});
