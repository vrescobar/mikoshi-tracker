import type { TodayMealSlot, TodayNutrition, TodaySlotProgress, TodaySummary } from "@mikoshi-tracker/contracts/today";

import type { PrismaClient } from "../../generated/prisma/client";
import type { Db } from "../../db/client";
import { computeAggregations } from "../aggregations/aggregation.service";
import { resolveActiveDietGoal } from "../diet/diet.service";
import {
  serializeContractFrequencyType,
  serializeContractHabitKind,
  serializeContractWeekdays,
} from "../../shared/habit-contract-mappers";
import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

import { buildTodaySummary } from "./today-summary";
import { resolveHabitDay } from "./today-clock";

type TodayServiceDeps = { db: PrismaClient; sqlite: Db };

const FOOD_MEAL_SLUG = "food_meal";

/**
 * Today's diet roll-up for the "today" view. Reuses `computeAggregations` (so
 * soft-deleted events are excluded and kcal uses the cached column) over the
 * single day. Returns null for users who don't log food, leaving the habit-only
 * experience untouched.
 */
export async function computeNutrition(
  deps: TodayServiceDeps,
  userId: string,
  todayKey: string,
): Promise<TodayNutrition | null> {
  const foodEntries = await deps.db.entry.findMany({
    where: { userId, isActive: true, entryType: { slug: FOOD_MEAL_SLUG } },
    select: { config: true },
  });
  if (foodEntries.length === 0) return null;

  const agg = await computeAggregations(deps, {
    userId,
    entryTypeSlug: FOOD_MEAL_SLUG,
    from: todayKey,
    to: todayKey,
    groupBy: "none",
  });
  const sum = agg.total.sum;

  // Prefer the history-aware diet_goal; fall back to the legacy
  // food_meal.config.dailyKcalTarget so users who set a target before goals
  // existed keep theirs.
  const goal = await resolveActiveDietGoal(deps, userId);

  let kcalTarget: number | null = goal?.kcalTarget ?? null;
  if (kcalTarget === null) {
    for (const entry of foodEntries) {
      try {
        const cfg = JSON.parse(entry.config) as { dailyKcalTarget?: unknown };
        if (typeof cfg.dailyKcalTarget === "number" && cfg.dailyKcalTarget > 0) {
          kcalTarget = cfg.dailyKcalTarget;
          break;
        }
      } catch {
        // Malformed config is ignored; the target simply stays null.
      }
    }
  }

  const slotTargets: Record<TodayMealSlot, number | null> = {
    breakfast: numericOrNull(goal?.breakfastKcal),
    lunch: numericOrNull(goal?.lunchKcal),
    dinner: numericOrNull(goal?.dinnerKcal),
    snack: numericOrNull(goal?.snackKcal),
    other: null,
  };

  const bySlot = await computeSlotProgress(deps, userId, todayKey, slotTargets);

  return {
    kcal: sum.kcal ?? 0,
    protein_g: sum.protein_g ?? 0,
    carbs_g: sum.carbs_g ?? 0,
    fat_g: sum.fat_g ?? 0,
    mealCount: agg.total.count,
    kcalTarget,
    proteinTargetG: numericOrNull(goal?.proteinTargetG),
    carbsTargetG: numericOrNull(goal?.carbsTargetG),
    fatTargetG: numericOrNull(goal?.fatTargetG),
    objective: goal?.objective ?? null,
    bySlot,
  };
}

const MEAL_SLOTS: readonly TodayMealSlot[] = ["breakfast", "lunch", "dinner", "snack", "other"];

function numericOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Per-slot consumed-vs-target kcal for today. Groups today's food events by the
 * `mealSlot` payload field and pairs each slot's consumption with its goal
 * target. Emits a row only for slots that have either consumption or a target,
 * so the dashboard stays quiet for users who don't track per slot.
 */
async function computeSlotProgress(
  deps: TodayServiceDeps,
  userId: string,
  todayKey: string,
  slotTargets: Record<TodayMealSlot, number | null>,
): Promise<TodaySlotProgress[]> {
  const grouped = await computeAggregations(deps, {
    userId,
    entryTypeSlug: FOOD_MEAL_SLUG,
    from: todayKey,
    to: todayKey,
    groupBy: "none",
    groupByPayload: "mealSlot",
  });

  const consumed = new Map<string, number>();
  for (const bucket of grouped.buckets) {
    const slot = bucket.key.kind === "payload" ? String(bucket.key.value) : "";
    consumed.set(slot, (consumed.get(slot) ?? 0) + (bucket.sum.kcal ?? 0));
  }

  const rows: TodaySlotProgress[] = [];
  for (const slot of MEAL_SLOTS) {
    const kcal = consumed.get(slot) ?? 0;
    const kcalTarget = slotTargets[slot];
    if (kcal === 0 && kcalTarget === null) continue;
    rows.push({ slot, kcal, kcalTarget });
  }
  return rows;
}

type PeriodCounter = {
  week: number;
  month: number;
};

function serializeHabit(habit: {
  id: string;
  name: string;
  kind: string;
  frequencyType: string;
  frequencyCount: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  weekdays: Array<{ day: string }>;
}) {
  return {
    id: habit.id,
    name: habit.name,
    kind: serializeContractHabitKind(habit.kind),
    frequencyType: serializeContractFrequencyType(habit.frequencyType),
    frequencyCount: habit.frequencyCount,
    targetValue: habit.targetValue,
    unit: habit.unit,
    startDate: habit.startDate,
    weekdays: serializeContractWeekdays(habit.weekdays),
  };
}

function incrementPeriodCounter(counters: Map<string, PeriodCounter>, habitId: string, key: keyof PeriodCounter) {
  const current = counters.get(habitId) ?? {
    week: 0,
    month: 0,
  };

  current[key] += 1;
  counters.set(habitId, current);
}

/**
 * Assembles the "today" view for a user: reads their active habit entries, the
 * day's check-in states, and week/month period progress, then folds them into a
 * `TodaySummary` via the pure `buildTodaySummary`. Shared by the legacy
 * `/api/today` controller and the v1 `GET /today/summary` adapter so both expose
 * identical semantics.
 */
export async function getTodaySummary(
  deps: TodayServiceDeps,
  params: { userId: string; timestamp: Date | number | string; timeZone?: string },
): Promise<{ summary: TodaySummary }> {
  const user = await deps.db.user.findUnique({
    where: { id: params.userId },
    select: { timezone: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const day = resolveHabitDay({
    timestamp: params.timestamp,
    timeZone: params.timeZone ?? user.timezone,
  });
  const rangeStart = day.weekStartKey < day.monthStartKey ? day.weekStartKey : day.monthStartKey;
  const rangeEnd = day.weekEndKey > day.monthEndKey ? day.weekEndKey : day.monthEndKey;

  // Habits are Entry rows of the two habit types; check-ins are their EntryEvents.
  const habitSlugFilter = { entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } } };
  const [habitEntries, dayStates, completedStates] = await Promise.all([
    deps.db.entry.findMany({
      where: {
        userId: params.userId,
        isActive: true,
        ...habitSlugFilter,
      },
      include: {
        entryType: { select: { slug: true } },
        weekdays: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    deps.db.entryEvent.findMany({
      where: {
        userId: params.userId,
        entry: habitSlugFilter,
        dateKey: day.todayKey,
      },
    }),
    deps.db.entryEvent.findMany({
      where: {
        userId: params.userId,
        entry: habitSlugFilter,
        completed: true,
        dateKey: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
    }),
  ]);

  const periodCounters = new Map<string, PeriodCounter>();

  for (const state of completedStates) {
    if (state.dateKey >= day.weekStartKey && state.dateKey <= day.weekEndKey) {
      incrementPeriodCounter(periodCounters, state.entryId, "week");
    }

    if (state.dateKey >= day.monthStartKey && state.dateKey <= day.monthEndKey) {
      incrementPeriodCounter(periodCounters, state.entryId, "month");
    }
  }

  const summary = buildTodaySummary({
    day,
    habits: habitEntries.map((entry) => serializeHabit(mapEntryToHabit(entry))),
    dayStates: dayStates.map((state) => ({
      habitId: state.entryId,
      dateKey: state.dateKey,
      value: state.value === null ? null : Number(state.value),
      completed: state.completed ?? false,
    })),
    periodProgress: Array.from(periodCounters.entries()).flatMap(([habitId, counts]) => [
      {
        habitId,
        period: "week" as const,
        periodKey: day.weekKey,
        completions: counts.week,
      },
      {
        habitId,
        period: "month" as const,
        periodKey: day.monthKey,
        completions: counts.month,
      },
    ]),
  });

  const nutrition = await computeNutrition(deps, params.userId, day.todayKey);

  return { summary: { ...summary, nutrition } };
}
