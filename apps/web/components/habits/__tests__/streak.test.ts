import { describe, expect, it } from "vitest";

import type { HabitTrendPoint } from "@mikoshi-tracker/contracts/habits";

import { countPeriodCompletions, describeStreak, type StreakCopy } from "../streak";

const copy: StreakCopy = {
  dayStreak: (n) => `${n}-day streak`,
  weekdayStreak: (n) => `${n} weekdays in a row`,
  periodStreak: (n, unit) => `${n}-${unit} streak`,
  keepAlive: (r, unit) => `${r} more this ${unit} keeps your streak`,
  periodProgress: (done, target, unit) => `${done}/${target} this ${unit}`,
};

function point(date: string, status: HabitTrendPoint["status"]): HabitTrendPoint {
  return {
    date,
    status,
    completionRate: status === "completed" ? 1 : 0,
    completedCount: status === "completed" ? 1 : 0,
    completionTarget: null,
    value: null,
    valueTarget: null,
  };
}

describe("describeStreak", () => {
  it("describes a daily habit as an N-day streak with no hint", () => {
    const d = describeStreak({ frequencyType: "daily", frequencyCount: null }, { currentStreak: 14 }, 0, copy);
    expect(d).toMatchObject({ value: 14, caption: "14-day streak", hint: null, progress: null, atRisk: false });
  });

  it("describes a weekdays habit distinctly", () => {
    const d = describeStreak({ frequencyType: "weekdays", frequencyCount: null }, { currentStreak: 9 }, 0, copy);
    expect(d.caption).toBe("9 weekdays in a row");
  });

  it("shows period progress + keep-alive hint for an unmet weekly_count week", () => {
    const d = describeStreak({ frequencyType: "weekly_count", frequencyCount: 3 }, { currentStreak: 6 }, 2, copy);
    expect(d.caption).toBe("6-week streak");
    expect(d.progress).toBe("2/3 this week");
    expect(d.hint).toBe("1 more this week keeps your streak");
    expect(d.atRisk).toBe(false); // partial progress is not yet "at risk"
  });

  it("drops the hint once the weekly target is met", () => {
    const d = describeStreak({ frequencyType: "weekly_count", frequencyCount: 3 }, { currentStreak: 6 }, 3, copy);
    expect(d.hint).toBeNull();
    expect(d.progress).toBe("3/3 this week");
    expect(d.atRisk).toBe(false);
  });

  it("flags at-risk when nothing is done yet this week", () => {
    const d = describeStreak({ frequencyType: "weekly_count", frequencyCount: 3 }, { currentStreak: 6 }, 0, copy);
    expect(d.atRisk).toBe(true);
    expect(d.hint).toBe("3 more this week keeps your streak");
  });
});

describe("countPeriodCompletions", () => {
  it("counts completed days since Monday for weekly_count", () => {
    // Week of 2026-05-04 (Mon) … 2026-05-10 (Sun).
    const points = [
      point("2026-05-04", "completed"), // Mon
      point("2026-05-05", "missed"), // Tue
      point("2026-05-06", "completed"), // Wed
      point("2026-05-07", "completed"), // Thu
      point("2026-05-08", "pending"), // Fri (today)
      point("2026-05-09", "not_due"),
      point("2026-05-10", "not_due"),
    ];
    expect(countPeriodCompletions(points, "weekly_count")).toBe(3);
  });

  it("returns 0 for daily/weekday frequencies", () => {
    const points = [point("2026-05-10", "completed")];
    expect(countPeriodCompletions(points, "daily")).toBe(0);
  });
});
