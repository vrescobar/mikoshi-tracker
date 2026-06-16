import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedBuiltInEntryTypes } from "../../src/modules/entry-types/seed";
import { createTestContext, type TestContext } from "../helpers/app";

describe("seedBuiltInEntryTypes", () => {
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

  it("inserts the built-in entry type slugs", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const types = await context!.app.db.entryType.findMany({
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
    const slugs = types.map((t) => t.slug);

    expect(slugs).toContain("food_meal");
    expect(slugs).toContain("habit_boolean");
    expect(slugs).toContain("habit_quantity");
    expect(slugs).toContain("weight_log");
    expect(slugs).toContain("temptation");
    expect(slugs).toContain("diet_goal");
    expect(slugs).toContain("food_item");
    expect(slugs).toContain("diet_prefs");
  });

  it("stores payloadSchemas that parse as valid JSON Schema objects", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const types = await context!.app.db.entryType.findMany({
      orderBy: { slug: "asc" },
    });

    expect(types).toHaveLength(8);

    for (const type of types) {
      const schema = JSON.parse(type.payloadSchema) as unknown;
      expect(schema).toMatchObject({ type: "object", properties: expect.any(Object) });
    }
  });

  it("marks all built-ins as isBuiltIn and isActive", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const notBuiltIn = await context!.app.db.entryType.findMany({
      where: { isBuiltIn: false },
    });
    expect(notBuiltIn).toHaveLength(0);

    const inactive = await context!.app.db.entryType.findMany({
      where: { isActive: false },
    });
    expect(inactive).toHaveLength(0);
  });

  it("is idempotent — calling twice leaves exactly 8 rows", async () => {
    await seedBuiltInEntryTypes(context!.app.db);
    await seedBuiltInEntryTypes(context!.app.db);

    const count = await context!.app.db.entryType.count();
    expect(count).toBe(8);
  });

  it("seeds diet_goal / food_item / diet_prefs as food-skill diet types", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const [goal, item, prefs] = await Promise.all([
      context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "diet_goal" } }),
      context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "food_item" } }),
      context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "diet_prefs" } }),
    ]);

    expect(goal.skillSlug).toBe("mikoshi-tracker-food");
    expect(item.cadence).toBe("event_log");
    expect(prefs.skillSlug).toBe("mikoshi-tracker-food");

    const goalPayload = JSON.parse(goal.payloadSchema) as { required: string[] };
    expect(goalPayload.required).toContain("kcalTarget");

    const prefsConfig = JSON.parse(prefs.configSchema) as { properties: Record<string, unknown> };
    expect(prefsConfig.properties).toHaveProperty("allergies");
  });

  it("seeds the temptation journal as an event_log type with a resistedValue sum field", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const temptation = await context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "temptation" } });
    expect(temptation.cadence).toBe("event_log");
    expect(temptation.skillSlug).toBeNull();
    const agg = JSON.parse(temptation.aggregations) as { sumFields: string[] };
    expect(agg.sumFields).toContain("resistedValue");
  });

  it("seeds food_meal with skillSlug mikoshi-tracker-food and cadence event_log", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const foodMeal = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "food_meal" },
    });

    expect(foodMeal.cadence).toBe("event_log");
    expect(foodMeal.skillSlug).toBe("mikoshi-tracker-food");
  });

  it("seeds habit_boolean and habit_quantity with cadence recurring", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const [boolean_, quantity] = await Promise.all([
      context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "habit_boolean" } }),
      context!.app.db.entryType.findUniqueOrThrow({ where: { slug: "habit_quantity" } }),
    ]);

    expect(boolean_.cadence).toBe("recurring");
    expect(quantity.cadence).toBe("recurring");
    expect(boolean_.skillSlug).toBeNull();
    expect(quantity.skillSlug).toBeNull();
  });

  it("seeds weight_log with event_log cadence, no skill, and correct payload schema", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const weightLog = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "weight_log" },
    });

    expect(weightLog.cadence).toBe("event_log");
    expect(weightLog.skillSlug).toBeNull();

    const payload = JSON.parse(weightLog.payloadSchema) as {
      required: string[];
      properties: Record<string, { type: string; minimum?: number }>;
    };
    expect(payload.required).toContain("weight_kg");
    expect(payload.properties.weight_kg).toMatchObject({ type: "number", minimum: 0 });
  });
});
