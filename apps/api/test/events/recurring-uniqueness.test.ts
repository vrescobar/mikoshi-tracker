import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

async function createHabit(context: TestContext, cookie: string): Promise<string> {
  const created = await context.app.inject({
    method: "POST",
    url: "/api/entries",
    headers: { cookie },
    payload: {
      entryTypeSlug: "habit_boolean",
      name: "Meditate",
      config: { frequencyType: "DAILY" },
    },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { item: { id: string } }).item.id;
}

describe("recurring event uniqueness", () => {
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

  it("upserts a single event per (entryId, dateKey) for recurring habits", async () => {
    const { cookie } = await signUp(context!.app, { timezone: "UTC" });
    const entryId = await createHabit(context!, cookie);

    const first = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: { completed: true } },
    });
    expect(first.statusCode).toBe(201);
    const firstId = (first.json() as { item: { id: string } }).item.id;

    const second = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T21:30:00.000Z", payload: { completed: false } },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = second.json() as {
      item: { id: string; payload: { completed: boolean }; mutations: Array<{ type: string }> };
    };

    // Same calendar day → ONE event (same id), TWO mutations (CREATE then UPDATE)
    expect(secondBody.item.id).toBe(firstId);
    expect(secondBody.item.payload.completed).toBe(false);
    expect(secondBody.item.mutations.map((m) => m.type)).toEqual(["CREATE", "UPDATE"]);

    const list = await context!.app.inject({
      method: "GET",
      url: `/api/events?entryId=${entryId}`,
      headers: { cookie },
    });
    expect((list.json() as { items: Array<{ id: string }> }).items).toHaveLength(1);
  });

  it("creates separate events for distinct days", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createHabit(context!, cookie);

    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: { completed: true } },
    });
    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-22T08:00:00.000Z", payload: { completed: true } },
    });

    const list = await context!.app.inject({
      method: "GET",
      url: `/api/events?entryId=${entryId}`,
      headers: { cookie },
    });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(2);
  });
});
