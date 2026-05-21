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

  it("inserts the three built-in entry type slugs", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const types = await context!.app.db.entryType.findMany({
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
    const slugs = types.map((t) => t.slug);

    expect(slugs).toContain("food_meal");
    expect(slugs).toContain("habit_boolean");
    expect(slugs).toContain("habit_quantity");
  });

  it("stores payloadSchemas that parse as valid JSON Schema objects", async () => {
    await seedBuiltInEntryTypes(context!.app.db);

    const types = await context!.app.db.entryType.findMany({
      orderBy: { slug: "asc" },
    });

    expect(types).toHaveLength(3);

    for (const type of types) {
      const schema = JSON.parse(type.payloadSchema) as unknown;
      expect(schema).toMatchObject({ type: "object", properties: expect.any(Object) });
    }
  });

  it("marks all three as isBuiltIn and isActive", async () => {
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

  it("is idempotent — calling twice leaves exactly 3 rows", async () => {
    await seedBuiltInEntryTypes(context!.app.db);
    await seedBuiltInEntryTypes(context!.app.db);

    const count = await context!.app.db.entryType.count();
    expect(count).toBe(3);
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
});
