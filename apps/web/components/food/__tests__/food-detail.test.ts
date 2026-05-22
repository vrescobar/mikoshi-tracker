import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: () => null }));
vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../ui", () => ({}));
vi.mock("../../../lib/navigation", () => ({ routes: {} }));
vi.mock("../../../lib/i18n/food", () => ({
  getFoodCopy: () => ({ detail: { edit: {}, mealSlots: {}, fields: {}, sources: {}, mutations: { types: {}, sources: {} }, photo: {}, deleteSection: {}, header: {}, backToFood: "" }, page: { card: {} } }),
}));
vi.mock("../../../lib/auth-client", () => ({
  attachmentFileUrl: (id: string) => `/api/attachments/${id}/file`,
}));
vi.mock("../../../lib/food-client", () => ({
  deleteFoodEvent: vi.fn(),
  getFoodEventDetail: vi.fn(),
  isFoodPayload: vi.fn(() => true),
  undoFoodEvent: vi.fn(),
  updateFoodEvent: vi.fn(),
}));

import type { EntryEventDetail, EventMutationRecord } from "@mikoshi-tracker/contracts/events";
import type { FoodPayload } from "../../../lib/food-client";

import { type EditState, editStateToPayload, isDeleted, validateEditState } from "../food-detail-page";

const basePayload: FoodPayload = {
  name: "Test Meal",
  kcal: 500,
  protein_g: 25,
  carbs_g: 60,
  fat_g: 15,
  fiber_g: 5,
  sugar_g: 10,
  portion_g: 300,
  mealSlot: "lunch",
  source: "manual",
  confidence: 1,
  similarToEventId: null,
  sources: null,
  notes: "Tasty",
};

const baseEditState: EditState = {
  name: "Test Meal",
  kcal: "500",
  protein_g: "25",
  carbs_g: "60",
  fat_g: "15",
  fiber_g: "5",
  sugar_g: "10",
  portion_g: "300",
  mealSlot: "lunch",
  notes: "Tasty",
};

const mockEditCopy = {
  validationName: "Name is required.",
  validationKcal: "Calories must be 0 or higher.",
  validationMacro: "Macro values must be 0 or higher.",
} as ReturnType<typeof import("../../../lib/i18n/food").getFoodCopy>["detail"]["edit"];

function makeMutation(type: EventMutationRecord["type"], createdAt: string): EventMutationRecord {
  return {
    id: `mut-${createdAt}`,
    entryId: "entry-1",
    eventId: "event-1",
    userId: "user-1",
    dateKey: createdAt.slice(0, 10),
    type,
    source: "WEB",
    note: null,
    previousPayload: null,
    nextPayload: null,
    createdAt,
    attachments: [],
  };
}

function makeEventDetail(mutations: EventMutationRecord[]): EntryEventDetail {
  return {
    id: "event-1",
    entryId: "entry-1",
    userId: "user-1",
    occurredAt: "2026-05-01T12:00:00.000Z",
    dateKey: "2026-05-01",
    payload: basePayload,
    value: null,
    completed: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    mutations,
    attachments: [],
  };
}

describe("editStateToPayload", () => {
  it("maps numeric string fields to numbers", () => {
    const result = editStateToPayload(baseEditState, basePayload);
    expect(result.kcal).toBe(500);
    expect(result.protein_g).toBe(25);
    expect(result.carbs_g).toBe(60);
    expect(result.fat_g).toBe(15);
  });

  it("returns 0 for empty numeric fields (parseFloat || 0)", () => {
    const state: EditState = { ...baseEditState, kcal: "", protein_g: "", carbs_g: "", fat_g: "" };
    const result = editStateToPayload(state, basePayload);
    expect(result.kcal).toBe(0);
    expect(result.protein_g).toBe(0);
    expect(result.carbs_g).toBe(0);
    expect(result.fat_g).toBe(0);
  });

  it("converts blank fiber_g to null", () => {
    const result = editStateToPayload({ ...baseEditState, fiber_g: "" }, basePayload);
    expect(result.fiber_g).toBeNull();
  });

  it("converts blank sugar_g to null", () => {
    const result = editStateToPayload({ ...baseEditState, sugar_g: "" }, basePayload);
    expect(result.sugar_g).toBeNull();
  });

  it("converts blank portion_g to null", () => {
    const result = editStateToPayload({ ...baseEditState, portion_g: "" }, basePayload);
    expect(result.portion_g).toBeNull();
  });

  it("converts blank notes to null", () => {
    const result = editStateToPayload({ ...baseEditState, notes: "  " }, basePayload);
    expect(result.notes).toBeNull();
  });

  it("converts blank mealSlot to null", () => {
    const result = editStateToPayload({ ...baseEditState, mealSlot: "" }, basePayload);
    expect(result.mealSlot).toBeNull();
  });

  it("trims name", () => {
    const result = editStateToPayload({ ...baseEditState, name: "  Meal  " }, basePayload);
    expect(result.name).toBe("Meal");
  });
});

describe("validateEditState", () => {
  it("returns null for a fully valid state", () => {
    expect(validateEditState(baseEditState, mockEditCopy)).toBeNull();
  });

  it("returns validationName when name is blank", () => {
    expect(validateEditState({ ...baseEditState, name: "" }, mockEditCopy)).toBe("Name is required.");
    expect(validateEditState({ ...baseEditState, name: "   " }, mockEditCopy)).toBe("Name is required.");
  });

  it("returns validationKcal when kcal is negative", () => {
    expect(validateEditState({ ...baseEditState, kcal: "-1" }, mockEditCopy)).toBe("Calories must be 0 or higher.");
  });

  it("returns validationKcal when kcal is NaN", () => {
    expect(validateEditState({ ...baseEditState, kcal: "abc" }, mockEditCopy)).toBe("Calories must be 0 or higher.");
  });

  it("returns validationMacro when protein_g is negative", () => {
    expect(validateEditState({ ...baseEditState, protein_g: "-5" }, mockEditCopy)).toBe("Macro values must be 0 or higher.");
  });

  it("returns validationMacro when carbs_g is NaN", () => {
    expect(validateEditState({ ...baseEditState, carbs_g: "bad" }, mockEditCopy)).toBe("Macro values must be 0 or higher.");
  });

  it("returns validationMacro when fat_g is negative", () => {
    expect(validateEditState({ ...baseEditState, fat_g: "-0.1" }, mockEditCopy)).toBe("Macro values must be 0 or higher.");
  });

  it("accepts 0 as a valid kcal value", () => {
    expect(validateEditState({ ...baseEditState, kcal: "0" }, mockEditCopy)).toBeNull();
  });
});

describe("isDeleted", () => {
  it("returns false when there are no mutations", () => {
    expect(isDeleted(makeEventDetail([]))).toBe(false);
  });

  it("returns true when the latest mutation is DELETE", () => {
    const mutations = [
      makeMutation("CREATE", "2026-05-01T10:00:00.000Z"),
      makeMutation("DELETE", "2026-05-01T11:00:00.000Z"),
    ];
    expect(isDeleted(makeEventDetail(mutations))).toBe(true);
  });

  it("returns false when the latest mutation is not DELETE", () => {
    const mutations = [
      makeMutation("CREATE", "2026-05-01T10:00:00.000Z"),
      makeMutation("UPDATE", "2026-05-01T11:00:00.000Z"),
    ];
    expect(isDeleted(makeEventDetail(mutations))).toBe(false);
  });

  it("uses latest-mutation-wins ordering (DELETE then UNDO → not deleted)", () => {
    const mutations = [
      makeMutation("CREATE", "2026-05-01T10:00:00.000Z"),
      makeMutation("DELETE", "2026-05-01T11:00:00.000Z"),
      makeMutation("UNDO", "2026-05-01T12:00:00.000Z"),
    ];
    expect(isDeleted(makeEventDetail(mutations))).toBe(false);
  });

  it("returns true when most recent of out-of-order mutations is DELETE", () => {
    const mutations = [
      makeMutation("DELETE", "2026-05-01T12:00:00.000Z"),
      makeMutation("CREATE", "2026-05-01T10:00:00.000Z"),
    ];
    expect(isDeleted(makeEventDetail(mutations))).toBe(true);
  });
});
