import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

import type { PrismaClient } from "../../generated/prisma/client";
import {
  serializeContractFrequencyType,
  serializeContractHabitKind,
  serializeContractWeekdays,
} from "../../shared/habit-contract-mappers";
import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

import { buildTodaySummary } from "./today-summary";
import { resolveHabitDay } from "./today-clock";

type TodayServiceDeps = { db: PrismaClient };

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
  params: { userId: string; timestamp: Date | number | string },
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
    timeZone: user.timezone,
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

  return { summary };
}
