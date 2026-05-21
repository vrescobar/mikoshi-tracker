import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedBuiltInEntryTypes } from "../../src/modules/entry-types/seed";
import {
  getCompiledSchema,
  invalidateSchemaCache,
} from "../../src/modules/entry-types/schema-cache";
import { createTestContext, type TestContext } from "../helpers/app";

describe("schema-cache", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = await createTestContext();
    await seedBuiltInEntryTypes(context.app.db);
    invalidateSchemaCache();
  });

  afterEach(async () => {
    invalidateSchemaCache();
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("compiles and returns a schema for a valid entryTypeId", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "habit_boolean" },
    });

    const compiled = await getCompiledSchema(context!.app.db, entryType.id);

    expect(compiled.cadence).toBe("recurring");
    expect(compiled.skillSlug).toBeNull();
    expect(compiled.aggregations.metrics).toContain("completion_rate");
    expect(compiled.aggregations.metrics).toContain("streak");
  });

  it("returns cached result on second call", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "food_meal" },
    });

    const first = await getCompiledSchema(context!.app.db, entryType.id);
    const second = await getCompiledSchema(context!.app.db, entryType.id);

    expect(first).toBe(second);
  });

  it("compiled payload schema validates a valid habit_boolean payload", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "habit_boolean" },
    });
    const { payload } = await getCompiledSchema(context!.app.db, entryType.id);

    expect(payload.safeParse({ completed: true }).success).toBe(true);
    expect(payload.safeParse({ completed: false }).success).toBe(true);
    expect(payload.safeParse({}).success).toBe(false);
    expect(payload.safeParse({ completed: true, extra: "x" }).success).toBe(false);
  });

  it("compiled payload schema validates a valid food_meal payload", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "food_meal" },
    });
    const { payload } = await getCompiledSchema(context!.app.db, entryType.id);

    const validMeal = {
      name: "Chicken rice",
      kcal: 450,
      protein_g: 35,
      carbs_g: 50,
      fat_g: 10,
      source: "manual",
      confidence: 1.0,
    };
    expect(payload.safeParse(validMeal).success).toBe(true);
    // missing required field
    const { kcal: _, ...missingKcal } = validMeal;
    expect(payload.safeParse(missingKcal).success).toBe(false);
  });

  it("food_meal has event_log cadence and correct skillSlug", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "food_meal" },
    });
    const compiled = await getCompiledSchema(context!.app.db, entryType.id);

    expect(compiled.cadence).toBe("event_log");
    expect(compiled.skillSlug).toBe("mikoshi-tracker-food");
    expect(compiled.aggregations.sumFields).toContain("kcal");
  });

  it("invalidateSchemaCache(id) causes next call to re-fetch from DB", async () => {
    const entryType = await context!.app.db.entryType.findUniqueOrThrow({
      where: { slug: "food_meal" },
    });

    await getCompiledSchema(context!.app.db, entryType.id);
    invalidateSchemaCache(entryType.id);
    const recompiled = await getCompiledSchema(context!.app.db, entryType.id);

    expect(recompiled.cadence).toBe("event_log");
    expect(recompiled.skillSlug).toBe("mikoshi-tracker-food");
  });

  it("invalidateSchemaCache() with no args clears all cached entries", async () => {
    const types = await context!.app.db.entryType.findMany();

    for (const t of types) {
      await getCompiledSchema(context!.app.db, t.id);
    }
    invalidateSchemaCache();

    for (const t of types) {
      const compiled = await getCompiledSchema(context!.app.db, t.id);
      expect(compiled.payload).toBeDefined();
    }
  });

  it("throws for an unknown entryTypeId", async () => {
    await expect(
      getCompiledSchema(context!.app.db, "nonexistent-id"),
    ).rejects.toThrow("EntryType not found: nonexistent-id");
  });
});
