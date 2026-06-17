import { describe, expect, it } from "vitest";

import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import { KCAL_PER_G, bucketsToIntakeData, formatBucketLabels } from "../charts/food-chart-theme";

function dayBucket(value: string, sum: Record<string, number>, missing = false): AggregationBucket {
  return { key: { kind: "date", value }, sum, count: missing ? 0 : 1, missing };
}

describe("bucketsToIntakeData", () => {
  it("derives macro-kcal contributions from grams", () => {
    const data = bucketsToIntakeData(
      [dayBucket("2026-06-17", { kcal: 600, protein_g: 30, carbs_g: 50, fat_g: 20 })],
      "day",
      "en",
    );
    expect(data).toHaveLength(1);
    const d = data[0];
    expect(d.proteinKcal).toBe(30 * KCAL_PER_G.protein);
    expect(d.carbsKcal).toBe(50 * KCAL_PER_G.carbs);
    expect(d.fatKcal).toBe(20 * KCAL_PER_G.fat);
    expect(d.kcal).toBe(600);
    expect(d.proteinG).toBe(30);
    expect(d.missing).toBe(false);
  });

  it("rounds gram and kcal values", () => {
    const [d] = bucketsToIntakeData(
      [dayBucket("2026-06-17", { kcal: 499.6, protein_g: 12.4, carbs_g: 0, fat_g: 0 })],
      "day",
      "en",
    );
    expect(d.kcal).toBe(500);
    expect(d.proteinG).toBe(12);
  });

  it("keeps missing buckets but marks them", () => {
    const [d] = bucketsToIntakeData([dayBucket("2026-06-17", { kcal: 0 }, true)], "day", "en");
    expect(d.missing).toBe(true);
    expect(d.kcal).toBe(0);
  });

  it("ignores non-date (payload) buckets", () => {
    const buckets = [
      dayBucket("2026-06-17", { kcal: 100 }),
      { key: { kind: "payload", field: "name", value: "eggs" }, sum: { kcal: 100 }, count: 1, missing: false },
    ] as AggregationBucket[];
    expect(bucketsToIntakeData(buckets, "day", "en")).toHaveLength(1);
  });
});

describe("formatBucketLabels", () => {
  it("labels a day bucket with a short month-day", () => {
    const { label } = formatBucketLabels("2026-06-17", "day", "en");
    expect(label).toMatch(/Jun/);
    expect(label).toMatch(/17/);
  });

  it("labels a week bucket with its ISO week number", () => {
    const { label } = formatBucketLabels("2026-W24", "week", "en");
    expect(label).toBe("W24");
  });

  it("labels a month bucket with the month name", () => {
    const { label } = formatBucketLabels("2026-06", "month", "en");
    expect(label).toMatch(/Jun/);
  });
});
