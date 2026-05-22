import { describe, expect, it, vi } from "vitest";

vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../../lib/i18n/food", () => ({
  getFoodCopy: () => ({ insights: { heatmap: { description: "", noData: "", legend: { none: "", low: "", medium: "", high: "" } } } }),
}));

import { buildDateRange, kcalIntensity } from "../RangeHeatmap";

describe("kcalIntensity", () => {
  it("returns 0 for kcal <= 0", () => {
    expect(kcalIntensity(0)).toBe(0);
    expect(kcalIntensity(-1)).toBe(0);
  });

  it("returns 1 for kcal in range (0, 1000)", () => {
    expect(kcalIntensity(1)).toBe(1);
    expect(kcalIntensity(999)).toBe(1);
  });

  it("returns 2 for kcal in range [1000, 2000]", () => {
    expect(kcalIntensity(1000)).toBe(2);
    expect(kcalIntensity(2000)).toBe(2);
  });

  it("returns 3 for kcal > 2000", () => {
    expect(kcalIntensity(2001)).toBe(3);
    expect(kcalIntensity(5000)).toBe(3);
  });
});

describe("buildDateRange", () => {
  it("returns a single day when from equals to", () => {
    const result = buildDateRange("2026-05-15", "2026-05-15");
    expect(result).toEqual(["2026-05-15"]);
  });

  it("returns two adjacent days", () => {
    const result = buildDateRange("2026-05-14", "2026-05-15");
    expect(result).toEqual(["2026-05-14", "2026-05-15"]);
  });

  it("includes both from and to dates", () => {
    const result = buildDateRange("2026-05-01", "2026-05-07");
    expect(result[0]).toBe("2026-05-01");
    expect(result[result.length - 1]).toBe("2026-05-07");
  });

  it("generates all 31 days for a full month (May 2026)", () => {
    const result = buildDateRange("2026-05-01", "2026-05-31");
    expect(result).toHaveLength(31);
    expect(result[0]).toBe("2026-05-01");
    expect(result[30]).toBe("2026-05-31");
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(`2026-05-${String(i + 1).padStart(2, "0")}`);
    }
  });

  it("crosses month boundaries correctly", () => {
    const result = buildDateRange("2026-04-29", "2026-05-02");
    expect(result).toEqual(["2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02"]);
  });

  it("returns empty array when from is after to", () => {
    const result = buildDateRange("2026-05-10", "2026-05-01");
    expect(result).toEqual([]);
  });
});
