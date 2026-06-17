import { describe, expect, it } from "bun:test";

import {
  inferMealSlotFromOccurredAt,
  localHourInZone,
  shouldInferMealSlot,
} from "../../src/modules/food/meal-slot";

describe("meal-slot inference", () => {
  it("maps wall-clock hour to a sensible slot (UTC)", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 5, 16, h, 30, 0));
    expect(inferMealSlotFromOccurredAt(at(8), "UTC")).toBe("breakfast");
    expect(inferMealSlotFromOccurredAt(at(13), "UTC")).toBe("lunch");
    expect(inferMealSlotFromOccurredAt(at(17), "UTC")).toBe("snack");
    expect(inferMealSlotFromOccurredAt(at(21), "UTC")).toBe("dinner");
    // The small hours read as a late dinner rather than an early breakfast.
    expect(inferMealSlotFromOccurredAt(at(1), "UTC")).toBe("dinner");
  });

  it("respects the user's timezone", () => {
    // 16:00 UTC is 12:00 in New York (DST) → lunch, not snack.
    const noonNy = new Date(Date.UTC(2026, 5, 16, 16, 0, 0));
    expect(localHourInZone(noonNy, "America/New_York")).toBe(12);
    expect(inferMealSlotFromOccurredAt(noonNy, "America/New_York")).toBe("lunch");
  });

  it("falls back to the default timezone (never throws) on bad/missing tz", () => {
    const at = new Date(Date.UTC(2026, 5, 16, 9, 0, 0));
    // normalizeUserTimeZone maps invalid/missing zones to the app default
    // (Asia/Shanghai, UTC+8) — so 09:00 UTC reads as 17:00 → snack, not a crash.
    const viaDefault = inferMealSlotFromOccurredAt(at, "Asia/Shanghai");
    expect(inferMealSlotFromOccurredAt(at, "Not/AZone")).toBe(viaDefault);
    expect(inferMealSlotFromOccurredAt(at, null)).toBe(viaDefault);
    expect(["breakfast", "lunch", "snack", "dinner"]).toContain(viaDefault);
  });

  it("only infers when the slot is absent or 'other'", () => {
    expect(shouldInferMealSlot(null)).toBe(true);
    expect(shouldInferMealSlot(undefined)).toBe(true);
    expect(shouldInferMealSlot("")).toBe(true);
    expect(shouldInferMealSlot("other")).toBe(true);
    expect(shouldInferMealSlot("breakfast")).toBe(false);
    expect(shouldInferMealSlot("dinner")).toBe(false);
  });
});
