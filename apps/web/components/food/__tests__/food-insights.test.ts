import { describe, expect, it, vi } from "vitest";

vi.mock("react-router", () => ({ Link: () => null }));
vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../RangeHeatmap", () => ({ RangeHeatmap: () => null }));
vi.mock("../../ui", () => ({}));
vi.mock("../../../lib/navigation", () => ({ routes: {} }));
vi.mock("../../../lib/i18n/food", () => ({
  getFoodCopy: () => ({ insights: { heatmap: { description: "", noData: "", legend: {} }, rangePicker: {}, header: {}, summary: {}, repeatedMeals: {}, missingDays: {} }, detail: { backToFood: "" } }),
}));
vi.mock("../../../lib/food-client", () => ({
  listFoodEvents: vi.fn(),
  getFoodAggregations: vi.fn(),
  isFoodPayload: (v: unknown): boolean => {
    if (!v || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return typeof obj["name"] === "string" && typeof obj["kcal"] === "number";
  },
}));

import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

import { computeRepeatedMeals, getMissingDays } from "../food-insights-page";

function makeEvent(name: string, dateKey: string): EntryEventRecord {
  return {
    id: `ev-${name}-${dateKey}`,
    entryId: "entry-1",
    userId: "user-1",
    occurredAt: `${dateKey}T12:00:00.000Z`,
    dateKey,
    payload: { name, kcal: 500, protein_g: 20, carbs_g: 30, fat_g: 10 },
    value: null,
    completed: null,
    createdAt: `${dateKey}T12:00:00.000Z`,
    updatedAt: `${dateKey}T12:00:00.000Z`,
  };
}

function makeBucket(key: string, missing: boolean): AggregationBucket {
  return {
    key: { kind: "date", value: key },
    sum: { kcal: missing ? 0 : 500 },
    count: missing ? 0 : 1,
    missing,
  };
}

describe("computeRepeatedMeals", () => {
  it("returns empty array when there are no events", () => {
    expect(computeRepeatedMeals([])).toEqual([]);
  });

  it("groups names case-insensitively", () => {
    const events = [
      makeEvent("Oatmeal", "2026-05-01"),
      makeEvent("oatmeal", "2026-05-02"),
      makeEvent("OATMEAL", "2026-05-03"),
    ];
    const result = computeRepeatedMeals(events);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it("excludes meals that appear only once", () => {
    const events = [
      makeEvent("Eggs", "2026-05-01"),
      makeEvent("Toast", "2026-05-02"),
      makeEvent("Toast", "2026-05-03"),
    ];
    const result = computeRepeatedMeals(events);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Toast");
  });

  it("tracks lastDate as the maximum date across all occurrences", () => {
    const events = [
      makeEvent("Yogurt", "2026-05-10"),
      makeEvent("Yogurt", "2026-05-01"),
      makeEvent("Yogurt", "2026-05-20"),
    ];
    const result = computeRepeatedMeals(events);
    expect(result[0].lastDate).toBe("2026-05-20");
  });

  it("sorts results by count descending", () => {
    const events = [
      makeEvent("Rice", "2026-05-01"),
      makeEvent("Rice", "2026-05-02"),
      makeEvent("Chicken", "2026-05-01"),
      makeEvent("Chicken", "2026-05-02"),
      makeEvent("Chicken", "2026-05-03"),
      makeEvent("Banana", "2026-05-01"),
      makeEvent("Banana", "2026-05-02"),
      makeEvent("Banana", "2026-05-03"),
      makeEvent("Banana", "2026-05-04"),
    ];
    const result = computeRepeatedMeals(events);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
    expect(result[1].count).toBeGreaterThanOrEqual(result[2].count);
    expect(result.map((r) => r.name)).toEqual(["Banana", "Chicken", "Rice"]);
  });

  it("skips events whose payload is not a food payload", () => {
    const events: EntryEventRecord[] = [
      { ...makeEvent("Soup", "2026-05-01"), payload: { notFood: true } },
      makeEvent("Soup", "2026-05-02"),
    ];
    const result = computeRepeatedMeals(events);
    expect(result).toHaveLength(0);
  });
});

describe("getMissingDays", () => {
  it("returns empty array for empty buckets", () => {
    expect(getMissingDays([])).toEqual([]);
  });

  it("returns keys of buckets where missing is true", () => {
    const buckets = [
      makeBucket("2026-05-01", false),
      makeBucket("2026-05-02", true),
      makeBucket("2026-05-03", false),
      makeBucket("2026-05-04", true),
    ];
    expect(getMissingDays(buckets)).toEqual(["2026-05-02", "2026-05-04"]);
  });

  it("returns empty array when no buckets are missing", () => {
    const buckets = [makeBucket("2026-05-01", false), makeBucket("2026-05-02", false)];
    expect(getMissingDays(buckets)).toEqual([]);
  });

  it("returns all keys when all buckets are missing", () => {
    const buckets = [makeBucket("2026-05-01", true), makeBucket("2026-05-02", true)];
    expect(getMissingDays(buckets)).toEqual(["2026-05-01", "2026-05-02"]);
  });
});
