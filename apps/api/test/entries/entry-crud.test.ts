import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("entries CRUD", () => {
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

  it("creates, lists, gets, updates, archives, and restores a habit_boolean entry", async () => {
    const { body, cookie } = await signUp(context!.app);

    const createResponse = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "habit_boolean",
        name: "Meditate",
        category: "wellbeing",
        config: { frequencyType: "DAILY" },
        startDate: "2026-03-01",
        weekdays: ["monday", "wednesday", "friday"],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { item: Record<string, unknown> };
    expect(created.item).toMatchObject({
      userId: body.user.id,
      entryTypeSlug: "habit_boolean",
      name: "Meditate",
      category: "wellbeing",
      isActive: true,
      startDate: "2026-03-01",
      weekdays: ["monday", "wednesday", "friday"],
      config: { frequencyType: "DAILY" },
    });
    const entryId = created.item.id as string;

    const listResponse = await context!.app.inject({
      method: "GET",
      url: "/api/entries?entryTypeSlug=habit_boolean",
      headers: { cookie },
    });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.map((item) => item.id)).toContain(entryId);

    const getResponse = await context!.app.inject({
      method: "GET",
      url: `/api/entries/${entryId}`,
      headers: { cookie },
    });
    expect(getResponse.statusCode).toBe(200);
    expect((getResponse.json() as { item: { id: string } }).item.id).toBe(entryId);

    const patchResponse = await context!.app.inject({
      method: "PATCH",
      url: `/api/entries/${entryId}`,
      headers: { cookie },
      payload: {
        name: "Meditate 10m",
        description: "Morning sit",
        config: { frequencyType: "WEEKDAYS" },
      },
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      item: {
        id: entryId,
        name: "Meditate 10m",
        description: "Morning sit",
        config: { frequencyType: "WEEKDAYS" },
      },
    });

    const archiveResponse = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/archive`,
      headers: { cookie },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toMatchObject({ item: { id: entryId, isActive: false } });

    const blockedUpdate = await context!.app.inject({
      method: "PATCH",
      url: `/api/entries/${entryId}`,
      headers: { cookie },
      payload: { name: "Should fail" },
    });
    expect(blockedUpdate.statusCode).toBe(409);
    expect(blockedUpdate.json()).toMatchObject({ code: "ENTRY_INACTIVE" });

    const restoreResponse = await context!.app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/restore`,
      headers: { cookie },
    });
    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toMatchObject({ item: { id: entryId, isActive: true } });
  });

  it("creates a habit_quantity entry and validates targetValue config", async () => {
    const { cookie } = await signUp(context!.app);

    const created = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "habit_quantity",
        name: "Read",
        config: { frequencyType: "DAILY", targetValue: 20, unit: "pages" },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      item: {
        entryTypeSlug: "habit_quantity",
        name: "Read",
        config: { frequencyType: "DAILY", targetValue: 20, unit: "pages" },
        weekdays: [],
      },
    });

    const missingTarget = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "habit_quantity",
        name: "Bad",
        config: { frequencyType: "DAILY" },
      },
    });
    expect(missingTarget.statusCode).toBe(400);
    expect(missingTarget.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a food_meal entry with an empty config", async () => {
    const { cookie } = await signUp(context!.app);

    const created = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "food_meal",
        name: "Default lunch",
        config: {},
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      item: {
        entryTypeSlug: "food_meal",
        name: "Default lunch",
        config: {},
        weekdays: [],
      },
    });
  });

  it("rejects unknown entry type slugs", async () => {
    const { cookie } = await signUp(context!.app);

    const response = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "nonexistent_type",
        name: "Nope",
        config: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("scopes entries to the authenticated user", async () => {
    const alice = await signUp(context!.app);
    const bob = await signUp(context!.app, { email: "bob@example.com", name: "Bob" });

    const aliceEntry = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie: alice.cookie },
      payload: {
        entryTypeSlug: "habit_boolean",
        name: "Alice habit",
        config: { frequencyType: "DAILY" },
      },
    });
    expect(aliceEntry.statusCode).toBe(201);
    const aliceEntryId = (aliceEntry.json() as { item: { id: string } }).item.id;

    const bobList = await context!.app.inject({
      method: "GET",
      url: "/api/entries",
      headers: { cookie: bob.cookie },
    });
    expect(bobList.statusCode).toBe(200);
    expect((bobList.json() as { items: unknown[] }).items).toEqual([]);

    const bobGet = await context!.app.inject({
      method: "GET",
      url: `/api/entries/${aliceEntryId}`,
      headers: { cookie: bob.cookie },
    });
    expect(bobGet.statusCode).toBe(404);

    const unauthList = await context!.app.inject({
      method: "GET",
      url: "/api/entries",
    });
    expect(unauthList.statusCode).toBe(401);
  });

  it("filters entries by isActive and query", async () => {
    const { cookie } = await signUp(context!.app);

    const first = await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "habit_boolean",
        name: "Walk",
        config: { frequencyType: "DAILY" },
      },
    });
    const firstId = (first.json() as { item: { id: string } }).item.id;

    await context!.app.inject({
      method: "POST",
      url: "/api/entries",
      headers: { cookie },
      payload: {
        entryTypeSlug: "habit_boolean",
        name: "Stretch",
        config: { frequencyType: "DAILY" },
      },
    });

    await context!.app.inject({
      method: "POST",
      url: `/api/entries/${firstId}/archive`,
      headers: { cookie },
    });

    const activeOnly = await context!.app.inject({
      method: "GET",
      url: "/api/entries?isActive=true",
      headers: { cookie },
    });
    const activeItems = (activeOnly.json() as { items: Array<{ name: string }> }).items;
    expect(activeItems.map((item) => item.name)).toEqual(["Stretch"]);

    const queryWalk = await context!.app.inject({
      method: "GET",
      url: "/api/entries?query=Walk",
      headers: { cookie },
    });
    const walkItems = (queryWalk.json() as { items: Array<{ id: string }> }).items;
    expect(walkItems.map((item) => item.id)).toEqual([firstId]);
  });

  it("filters entries by a comma-separated list of entry type slugs", async () => {
    const { cookie } = await signUp(context!.app);

    const create = async (entryTypeSlug: string, name: string, config: Record<string, unknown>) => {
      const response = await context!.app.inject({
        method: "POST",
        url: "/api/entries",
        headers: { cookie },
        payload: { entryTypeSlug, name, config },
      });
      expect(response.statusCode).toBe(201);
    };

    await create("habit_boolean", "Walk", { frequencyType: "DAILY" });
    await create("habit_quantity", "Read", { frequencyType: "DAILY", targetValue: 10, unit: "pages" });
    await create("food_meal", "Lunch", {});

    // The habits surface requests both habit slugs at once.
    const habitsOnly = await context!.app.inject({
      method: "GET",
      url: "/api/entries?entryTypeSlug=habit_boolean,habit_quantity",
      headers: { cookie },
    });
    expect(habitsOnly.statusCode).toBe(200);
    const habitNames = (habitsOnly.json() as { items: Array<{ name: string }> }).items
      .map((item) => item.name)
      .sort();
    expect(habitNames).toEqual(["Read", "Walk"]);
  });
});
