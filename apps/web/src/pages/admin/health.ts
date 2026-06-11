// Shared helpers for the Plan (habit scheduling/adherence) and Diet tabs.
// All date math runs on local YYYY-MM-DD keys, matching the server's dateKey
// convention closely enough for an operator-facing overview.

import type { EntryRecord } from "../../../lib/admin-client";

export const HABIT_SLUGS = ["habit_boolean", "habit_quantity"] as const;
export const FOOD_MEAL_SLUG = "food_meal";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

// Chart palette — drawn from the admin CSS variables so charts read as part of
// the same calm, refined system rather than generic SaaS rainbows.
export const CHART = {
  accent: "#16463c",
  protein: "#16463c",
  carbs: "#2a5b8a",
  fat: "#8a5a00",
  kcal: "#3c4858",
  faint: "#cdd3dc",
  grid: "#e6e9ef",
  target: "#b3261e",
} as const;

// Known values stay autocompletable while unknown server values remain valid.
export type FrequencyType = "DAILY" | "WEEKDAYS" | "WEEKLY_COUNT" | "MONTHLY_COUNT" | (string & {});

export type HabitConfig = {
  frequencyType?: FrequencyType;
  frequencyCount?: number | null;
  targetValue?: number | null;
  unit?: string | null;
};

export type Habit = EntryRecord & {
  freq: FrequencyType;
  freqCount: number | null;
  targetValue: number | null;
  unit: string | null;
  kind: "boolean" | "quantity";
};

export function isHabit(e: EntryRecord): boolean {
  return (HABIT_SLUGS as readonly string[]).includes(e.entryTypeSlug);
}

export function toHabit(e: EntryRecord): Habit {
  const cfg = (e.config ?? {}) as HabitConfig;
  return {
    ...e,
    freq: (cfg.frequencyType ?? "DAILY"),
    freqCount: cfg.frequencyCount ?? null,
    targetValue: cfg.targetValue ?? null,
    unit: cfg.unit ?? null,
    kind: e.entryTypeSlug === "habit_quantity" ? "quantity" : "boolean",
  };
}

/** Deterministic = scheduled on specific days (DAILY / WEEKDAYS). */
export function isDeterministic(h: Habit): boolean {
  return h.freq === "DAILY" || h.freq === "WEEKDAYS";
}

export function frequencyLabel(h: Habit): string {
  switch (h.freq) {
    case "DAILY":
      return "Every day";
    case "WEEKDAYS":
      return h.weekdays && h.weekdays.length > 0
        ? h.weekdays.map((d) => WEEKDAY_SHORT[d as Weekday] ?? d).join(" · ")
        : "Selected days";
    case "WEEKLY_COUNT":
      return `${h.freqCount ?? "?"}× per week`;
    case "MONTHLY_COUNT":
      return `${h.freqCount ?? "?"}× per month`;
    default:
      return h.freq;
  }
}

/** Whether a deterministic habit is scheduled on a given weekday. */
export function scheduledOn(h: Habit, weekday: Weekday): boolean {
  if (h.freq === "DAILY") return true;
  if (h.freq === "WEEKDAYS") return (h.weekdays ?? []).includes(weekday);
  return false;
}

// ── date keys ────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

/** Inclusive list of YYYY-MM-DD keys from `from` to `to`. */
export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    out.push(dateKey(d));
  }
  return out;
}

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function weekdayOfKey(key: string): Weekday {
  return JS_DAY_TO_WEEKDAY[new Date(`${key}T00:00:00`).getDay()];
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
