/**
 * Tests for the confirmation gate: needsConfirmation + buildConfirmationMessage.
 */
import { describe, test, expect } from "bun:test";
import {
  needsConfirmation,
  buildConfirmationMessage,
  type ProposedPayload,
} from "../lib/confirm.js";

const BASE_PROPOSED: ProposedPayload = {
  name: "Tortilla española",
  kcal: 250,
  protein_g: 12,
  carbs_g: 20,
  fat_g: 10,
  confidence: 0.7,
  source: "web_lookup",
};

// ─── needsConfirmation ────────────────────────────────────────────────────────

describe("needsConfirmation", () => {
  test("manual source → never needs confirmation", () => {
    expect(needsConfirmation(0.0, "manual")).toBe(false);
    expect(needsConfirmation(0.5, "manual")).toBe(false);
    expect(needsConfirmation(1.0, "manual")).toBe(false);
  });

  test("label confidence ≥ 0.85 → no confirmation", () => {
    expect(needsConfirmation(0.85, "label")).toBe(false);
    expect(needsConfirmation(0.90, "label")).toBe(false);
    expect(needsConfirmation(0.95, "label")).toBe(false);
  });

  test("label confidence < 0.85 → needs confirmation", () => {
    expect(needsConfirmation(0.84, "label")).toBe(true);
    expect(needsConfirmation(0.70, "label")).toBe(true);
    expect(needsConfirmation(0.0, "label")).toBe(true);
  });

  test("similar_to_event confidence ≥ 0.85 → no confirmation", () => {
    expect(needsConfirmation(0.85, "similar_to_event")).toBe(false);
    expect(needsConfirmation(0.90, "similar_to_event")).toBe(false);
  });

  test("similar_to_event confidence < 0.85 → needs confirmation", () => {
    expect(needsConfirmation(0.84, "similar_to_event")).toBe(true);
    expect(needsConfirmation(0.70, "similar_to_event")).toBe(true);
  });

  test("web_lookup → always needs confirmation regardless of confidence", () => {
    expect(needsConfirmation(0.70, "web_lookup")).toBe(true);
    expect(needsConfirmation(0.50, "web_lookup")).toBe(true);
    expect(needsConfirmation(0.10, "web_lookup")).toBe(true);
  });

  test("vision_only → always needs confirmation", () => {
    expect(needsConfirmation(0.55, "vision_only")).toBe(true);
    expect(needsConfirmation(0.30, "vision_only")).toBe(true);
    expect(needsConfirmation(0.0, "vision_only")).toBe(true);
  });
});

// ─── buildConfirmationMessage ─────────────────────────────────────────────────

describe("buildConfirmationMessage", () => {
  test("includes food name, kcal, protein, carbs, fat", () => {
    const msg = buildConfirmationMessage(BASE_PROPOSED);
    expect(msg).toContain("Tortilla española");
    expect(msg).toContain("250 kcal");
    expect(msg).toContain("12g");  // protein
    expect(msg).toContain("20g");  // carbs
    expect(msg).toContain("10g");  // fat
  });

  test("includes source label and confidence percentage", () => {
    const msg = buildConfirmationMessage(BASE_PROPOSED);
    expect(msg).toContain("búsqueda web");
    expect(msg).toContain("70%");
  });

  test("includes confirmation prompt text", () => {
    const msg = buildConfirmationMessage(BASE_PROPOSED);
    expect(msg).toMatch(/sí/i);
    expect(msg).toMatch(/confirm/i);
  });

  test("includes fiber when present", () => {
    const proposed: ProposedPayload = { ...BASE_PROPOSED, fiber_g: 3 };
    const msg = buildConfirmationMessage(proposed);
    expect(msg).toContain("Fibra");
    expect(msg).toContain("3g");
  });

  test("omits fiber section when null", () => {
    const proposed: ProposedPayload = { ...BASE_PROPOSED, fiber_g: null };
    const msg = buildConfirmationMessage(proposed);
    expect(msg).not.toContain("Fibra");
  });

  test("includes meal slot translated to Spanish when present", () => {
    const proposed: ProposedPayload = { ...BASE_PROPOSED, meal_slot: "breakfast" };
    const msg = buildConfirmationMessage(proposed);
    expect(msg).toContain("Desayuno");
  });

  test("includes sources count when present", () => {
    const proposed: ProposedPayload = {
      ...BASE_PROPOSED,
      sources: ["https://a.com", "https://b.com"],
    };
    const msg = buildConfirmationMessage(proposed);
    expect(msg).toContain("2 resultado(s) web");
  });

  test("source label maps correctly for all sources", () => {
    const cases: Array<[ProposedPayload["source"], string]> = [
      ["label", "etiqueta nutricional"],
      ["similar_to_event", "historial reciente"],
      ["web_lookup", "búsqueda web"],
      ["vision_only", "estimación visual"],
      ["manual", "entrada manual"],
    ];
    for (const [source, expected] of cases) {
      const msg = buildConfirmationMessage({ ...BASE_PROPOSED, source });
      expect(msg).toContain(expected);
    }
  });
});
