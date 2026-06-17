import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

async function createEntry(
  context: TestContext,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const created = await context.app.inject({
    method: "POST",
    url: "/api/entries",
    headers: { cookie },
    payload,
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { item: { id: string } }).item.id;
}

describe("event payload validation against EntryType.payloadSchema", () => {
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

  it("rejects a habit_boolean payload missing `completed`", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createEntry(context!, cookie, {
      entryTypeSlug: "habit_boolean",
      name: "Meditate",
      config: { frequencyType: "DAILY" },
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: {} },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a habit_boolean payload with the wrong type", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createEntry(context!, cookie, {
      entryTypeSlug: "habit_boolean",
      name: "Meditate",
      config: { frequencyType: "DAILY" },
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: { occurredAt: "2026-05-21T08:00:00.000Z", payload: { completed: "yes" } },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects unknown payload properties (additionalProperties: false)", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createEntry(context!, cookie, {
      entryTypeSlug: "habit_boolean",
      name: "Meditate",
      config: { frequencyType: "DAILY" },
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: {
        occurredAt: "2026-05-21T08:00:00.000Z",
        payload: { completed: true, extra: 1 },
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a food_meal payload missing required macro fields", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createEntry(context!, cookie, {
      entryTypeSlug: "food_meal",
      name: "Meals",
      config: {},
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: {
        occurredAt: "2026-05-21T08:00:00.000Z",
        payload: { name: "Mystery", kcal: 100 },
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts a valid habit_quantity payload", async () => {
    const { cookie } = await signUp(context!.app);
    const entryId = await createEntry(context!, cookie, {
      entryTypeSlug: "habit_quantity",
      name: "Read",
      config: { frequencyType: "DAILY", targetValue: 20, unit: "pages" },
    });

    const response = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/events`,
      headers: { cookie },
      payload: {
        occurredAt: "2026-05-21T08:00:00.000Z",
        payload: { value: 25, completed: true },
      },
    });
    expect(response.statusCode).toBe(201);
    expect((response.json() as { item: { value: number } }).item.value).toBe(25);
  });
});
