import { describe, expect, it } from "bun:test";

import { jsonSchemaToZod } from "../../src/modules/entry-types/json-schema-to-zod";

describe("jsonSchemaToZod", () => {
  describe("valid payloads pass", () => {
    it("validates a simple string field", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ name: "Alice" }).success).toBe(true);
    });

    it("validates habit_boolean payload (completed: true)", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ completed: true }).success).toBe(true);
      expect(schema.safeParse({ completed: false }).success).toBe(true);
    });

    it("validates habit_quantity payload (value and completed)", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["value", "completed"],
        properties: {
          value: { type: "number", minimum: 0 },
          completed: { type: "boolean" },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ value: 10, completed: true }).success).toBe(true);
    });

    it("validates an enum field", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["frequencyType"],
        properties: {
          frequencyType: {
            type: "string",
            enum: ["DAILY", "WEEKDAYS", "WEEKLY_COUNT", "MONTHLY_COUNT"],
          },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ frequencyType: "DAILY" }).success).toBe(true);
      expect(schema.safeParse({ frequencyType: "WEEKLY_COUNT" }).success).toBe(true);
    });

    it("validates a nullable field with null value", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: [],
        properties: {
          note: { type: "string", nullable: true },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ note: null }).success).toBe(true);
      expect(schema.safeParse({ note: "hello" }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(true);
    });

    it("validates a nullable enum with null value", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: [],
        properties: {
          mealSlot: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner"],
            nullable: true,
          },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ mealSlot: null }).success).toBe(true);
      expect(schema.safeParse({ mealSlot: "lunch" }).success).toBe(true);
    });

    it("validates an integer field", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["count"],
        properties: { count: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ count: 5 }).success).toBe(true);
    });

    it("validates an array field", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: [],
        properties: {
          sources: { type: "array", items: { type: "string" }, nullable: true },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ sources: ["url1", "url2"] }).success).toBe(true);
      expect(schema.safeParse({ sources: null }).success).toBe(true);
    });

    it("validates the full food_meal payload", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["name", "kcal", "protein_g", "carbs_g", "fat_g", "source", "confidence"],
        properties: {
          name: { type: "string", minLength: 1 },
          kcal: { type: "number", minimum: 0 },
          protein_g: { type: "number", minimum: 0 },
          carbs_g: { type: "number", minimum: 0 },
          fat_g: { type: "number", minimum: 0 },
          fiber_g: { type: "number", minimum: 0, nullable: true },
          sugar_g: { type: "number", minimum: 0, nullable: true },
          portion_g: { type: "number", minimum: 0, nullable: true },
          mealSlot: {
            type: "string",
            enum: ["breakfast", "lunch", "snack", "dinner", "other"],
            nullable: true,
          },
          source: {
            type: "string",
            enum: ["label", "similar_to_event", "web_lookup", "vision_only", "manual"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          similarToEventId: { type: "string", nullable: true },
          sources: { type: "array", items: { type: "string" }, nullable: true },
          notes: { type: "string", nullable: true },
        },
        additionalProperties: false,
      });

      const validMeal = {
        name: "Chicken rice",
        kcal: 450,
        protein_g: 35,
        carbs_g: 50,
        fat_g: 10,
        source: "manual",
        confidence: 1.0,
      };
      expect(schema.safeParse(validMeal).success).toBe(true);
    });
  });

  describe("missing required field fails", () => {
    it("rejects an object missing a required field", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
        additionalProperties: false,
      });
      expect(schema.safeParse({}).success).toBe(false);
    });

    it("rejects a food_meal payload missing kcal", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["name", "kcal"],
        properties: {
          name: { type: "string" },
          kcal: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ name: "Toast" }).success).toBe(false);
    });
  });

  describe("wrong type fails", () => {
    it("rejects a string where boolean is expected", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ completed: "yes" }).success).toBe(false);
    });

    it("rejects a string where number is expected", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["value"],
        properties: { value: { type: "number", minimum: 0 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ value: "10" }).success).toBe(false);
    });

    it("rejects an invalid enum value", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["source"],
        properties: {
          source: {
            type: "string",
            enum: ["label", "manual"],
          },
        },
        additionalProperties: false,
      });
      expect(schema.safeParse({ source: "unknown" }).success).toBe(false);
    });

    it("rejects a float where integer is required", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["count"],
        properties: { count: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ count: 1.5 }).success).toBe(false);
    });
  });

  describe("out-of-range fails", () => {
    it("rejects a number below minimum", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["kcal"],
        properties: { kcal: { type: "number", minimum: 0 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ kcal: -1 }).success).toBe(false);
    });

    it("rejects a number above maximum", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["confidence"],
        properties: { confidence: { type: "number", minimum: 0, maximum: 1 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ confidence: 1.1 }).success).toBe(false);
    });

    it("rejects a string shorter than minLength", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ name: "" }).success).toBe(false);
    });

    it("rejects an integer below minimum", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["count"],
        properties: { count: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ count: 0 }).success).toBe(false);
    });
  });

  describe("extra field fails (strict mode)", () => {
    it("rejects an object with an extra field when additionalProperties is false", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
        additionalProperties: false,
      });
      expect(schema.safeParse({ completed: true, extra: "x" }).success).toBe(false);
    });

    it("allows extra fields when additionalProperties is not false", () => {
      const schema = jsonSchemaToZod({
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
      });
      expect(schema.safeParse({ completed: true, extra: "x" }).success).toBe(true);
    });
  });

  describe("unsupported schema throws", () => {
    it("throws for an unsupported type", () => {
      expect(() =>
        jsonSchemaToZod({ type: "null" }),
      ).toThrow('Unsupported JSON Schema type: "null"');
    });

    it("throws for a non-object root schema", () => {
      expect(() => jsonSchemaToZod("string")).toThrow(
        "JSON Schema root must be a plain object",
      );
    });
  });
});
