import type { PrismaClient } from "../../generated/prisma/client";

import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

export type PersistedStatsHabitRecord = {
  id: string;
  name: string;
  kind: string;
  frequencyType: string;
  frequencyCount: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  weekdays: Array<{ day: string }>;
  dayStates: Array<{
    dateKey: string;
    value: number | null;
    completed: boolean;
  }>;
};

export async function findUserTimezone(
  db: PrismaClient,
  params: {
    userId: string;
  },
) {
  return db.user.findUnique({
    where: {
      id: params.userId,
    },
    select: {
      timezone: true,
    },
  });
}

export async function listActiveHabitStatsRecords(
  db: PrismaClient,
  params: {
    userId: string;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<PersistedStatsHabitRecord[]> {
  // Habits are Entry rows of the habit_* types; their day states are EntryEvents.
  const entries = await db.entry.findMany({
    where: {
      userId: params.userId,
      isActive: true,
      entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } },
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      entryType: { select: { slug: true } },
      weekdays: true,
      events: {
        where: {
          dateKey: {
            gte: params.rangeStart,
            lte: params.rangeEnd,
          },
        },
        orderBy: {
          dateKey: "asc",
        },
      },
    },
  });

  return entries.map((entry) => {
    const habit = mapEntryToHabit(entry);
    return {
      id: habit.id,
      name: habit.name,
      kind: habit.kind,
      frequencyType: habit.frequencyType,
      frequencyCount: habit.frequencyCount,
      targetValue: habit.targetValue,
      unit: habit.unit,
      startDate: habit.startDate,
      weekdays: habit.weekdays,
      dayStates: entry.events.map((event) => ({
        dateKey: event.dateKey,
        value: event.value === null ? null : Number(event.value),
        completed: event.completed ?? false,
      })),
    };
  });
}
