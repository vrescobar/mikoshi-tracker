import type { HabitRecord, HabitTrendPoint } from "@mikoshi-tracker/contracts/habits";

export type StreakCopy = {
  /** e.g. (14) => "14-day streak" */
  dayStreak: (n: number) => string;
  /** e.g. (9) => "9 weekdays in a row" */
  weekdayStreak: (n: number) => string;
  /** e.g. (6, "week") => "6-week streak" */
  periodStreak: (n: number, unit: "week" | "month") => string;
  /** e.g. (1, "week") => "1 more this week keeps your streak" */
  keepAlive: (remaining: number, unit: "week" | "month") => string;
  /** e.g. (2, 3, "week") => "2/3 this week" */
  periodProgress: (done: number, target: number, unit: "week" | "month") => string;
};

export type StreakDescriptor = {
  value: number;
  caption: string;
  /** The motivational "X more keeps your streak alive" line, when applicable. */
  hint: string | null;
  /** Period progress label for count-based frequencies (e.g. "2/3 this week"). */
  progress: string | null;
  /** True when the current period is unmet and at risk — surfaces a warning tone. */
  atRisk: boolean;
};

/**
 * Frequency-aware streak description. The key product behaviour: for a
 * "3×/week" habit, completing the weekly target keeps the streak alive — so the
 * badge shows period progress and "N more this week keeps your streak" rather
 * than treating every non-daily completion as a break.
 */
export function describeStreak(
  habit: Pick<HabitRecord, "frequencyType" | "frequencyCount">,
  stats: { currentStreak: number },
  periodCompleted: number,
  copy: StreakCopy,
): StreakDescriptor {
  const value = stats.currentStreak;

  if (habit.frequencyType === "weekly_count" || habit.frequencyType === "monthly_count") {
    const unit = habit.frequencyType === "weekly_count" ? "week" : "month";
    const target = habit.frequencyCount ?? 1;
    const remaining = Math.max(0, target - periodCompleted);
    const met = periodCompleted >= target;
    return {
      value,
      caption: copy.periodStreak(value, unit),
      hint: met ? null : copy.keepAlive(remaining, unit),
      progress: copy.periodProgress(Math.min(periodCompleted, target), target, unit),
      atRisk: !met && periodCompleted > 0 ? false : !met,
    };
  }

  if (habit.frequencyType === "weekdays") {
    return { value, caption: copy.weekdayStreak(value), hint: null, progress: null, atRisk: false };
  }

  // daily
  return { value, caption: copy.dayStreak(value), hint: null, progress: null, atRisk: false };
}

/**
 * Count completions in the current period from a habit's last-7-days trend.
 * For weekly_count we count completed days since the most recent Monday; for
 * monthly_count we approximate with the 7-day window (the badge is a nudge, not
 * the source of truth — the server owns the streak number itself).
 */
export function countPeriodCompletions(points: HabitTrendPoint[], frequencyType: HabitRecord["frequencyType"]): number {
  if (points.length === 0) return 0;
  if (frequencyType !== "weekly_count" && frequencyType !== "monthly_count") return 0;

  const today = new Date(`${points[points.length - 1].date}T12:00:00`);
  const day = today.getDay(); // 0=Sun … 6=Sat
  const sinceMonday = (day + 6) % 7; // days back to Monday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - sinceMonday);
  const weekStartKey = weekStart.toISOString().slice(0, 10);

  return points.filter((p) => p.status === "completed" && p.date >= weekStartKey).length;
}
