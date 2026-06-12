/**
 * Tests for validateFoodPayload in api-client.ts.
 */
import { describe, test, expect } from "bun:test";
import { validateFoodPayload, type FoodPayload } from "../lib/api-client.js";

const VALID_PAYLOAD: FoodPayload = {
  name: "Tortilla española",
  kcal: 250,
  protein_g: 12,
  carbs_g: 20,
  fat_g: 10,
  source: "manual",
  confidence: 1.0,
};

describe("validateFoodPayload", () => {
  test("valid complete payload passes without throwing", () => {
    expect(() => validateFoodPayload(VALID_PAYLOAD)).not.toThrow();
  });

  test("valid payload with optional fields passes", () => {
    const payload: FoodPayload = {
      ...VALID_PAYLOAD,
      fiber_g: 3,
      sugar_g: 5,
      portion_g: 150,
      mealSlot: "lunch",
      similarToEventId: "evt123",
      sources: ["https://example.com"],
      notes: "Test note",
    };
    expect(() => validateFoodPayload(payload)).not.toThrow();
  });

  test("missing name throws", () => {
    const payload = { ...VALID_PAYLOAD, name: "" };
    expect(() => validateFoodPayload(payload)).toThrow(/name/i);
  });

  test("negative kcal throws", () => {
    const payload = { ...VALID_PAYLOAD, kcal: -1 };
    expect(() => validateFoodPayload(payload)).toThrow(/kcal/i);
  });

  test("zero kcal passes (valid — fasting/water)", () => {
    const payload = { ...VALID_PAYLOAD, kcal: 0 };
    expect(() => validateFoodPayload(payload)).not.toThrow();
  });

  test("negative protein_g throws", () => {
    const payload = { ...VALID_PAYLOAD, protein_g: -0.1 };
    expect(() => validateFoodPayload(payload)).toThrow(/protein_g/i);
  });

  test("negative carbs_g throws", () => {
    const payload = { ...VALID_PAYLOAD, carbs_g: -5 };
    expect(() => validateFoodPayload(payload)).toThrow(/carbs_g/i);
  });

  test("negative fat_g throws", () => {
    const payload = { ...VALID_PAYLOAD, fat_g: -0.5 };
    expect(() => validateFoodPayload(payload)).toThrow(/fat_g/i);
  });

  test("missing source throws", () => {
    const payload = { ...VALID_PAYLOAD, source: "" };
    expect(() => validateFoodPayload(payload)).toThrow(/source/i);
  });

  test("confidence below 0 throws", () => {
    const payload = { ...VALID_PAYLOAD, confidence: -0.1 };
    expect(() => validateFoodPayload(payload)).toThrow(/confidence/i);
  });

  test("confidence above 1 throws", () => {
    const payload = { ...VALID_PAYLOAD, confidence: 1.1 };
    expect(() => validateFoodPayload(payload)).toThrow(/confidence/i);
  });

  test("confidence = 0 passes", () => {
    const payload = { ...VALID_PAYLOAD, confidence: 0 };
    expect(() => validateFoodPayload(payload)).not.toThrow();
  });

  test("confidence = 1 passes", () => {
    const payload = { ...VALID_PAYLOAD, confidence: 1 };
    expect(() => validateFoodPayload(payload)).not.toThrow();
  });
});
