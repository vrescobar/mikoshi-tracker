import { describe, expect, it } from "vitest";

import { dateKeyToLocalNoonTimestamp, resolveHabitDay } from "../../src/modules/today/today-clock";

describe("dateKeyToLocalNoonTimestamp", () => {
  // The invariant the backdate feature relies on: a dateKey converted to a
  // local-noon instant must resolve back to the SAME dateKey via resolveHabitDay
  // (so a backdated check-in lands on the day the member meant).
  const timeZones = ["UTC", "Europe/Madrid", "Asia/Shanghai", "America/Mexico_City", "Asia/Kolkata"];
  const dateKeys = ["2026-06-01", "2026-01-15", "2026-03-29", "2026-10-25", "2026-12-31"];

  for (const timeZone of timeZones) {
    for (const dateKey of dateKeys) {
      it(`round-trips ${dateKey} in ${timeZone}`, () => {
        const ts = dateKeyToLocalNoonTimestamp(dateKey, timeZone);
        expect(resolveHabitDay({ timestamp: ts, timeZone }).todayKey).toBe(dateKey);
      });
    }
  }

  it("lands at local noon (well clear of the 4am cutoff)", () => {
    const ts = dateKeyToLocalNoonTimestamp("2026-06-01", "Europe/Madrid");
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" })
        .formatToParts(ts)
        .find((p) => p.type === "hour")!.value,
    );
    expect(hour).toBe(12);
  });
});
