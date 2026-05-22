import type { Prisma, PrismaClient } from "../../generated/prisma/client";

import { findEntryTypeBySlug } from "../entries/entry.repository";
import {
  buildHabitConfig,
  habitKindToSlug,
  HABIT_ENTRY_TYPE_SLUGS,
  mapEntryToHabit,
  type MappedHabit,
} from "./habit-entry-adapter";
import type { NormalizedCreateHabitInput } from "./habit.schema";

// Habits are stored as `Entry` rows of type habit_boolean/habit_quantity. These
// repository functions keep their legacy names and return shapes (consumed by the
// unchanged habit.service) but read/write the generic Entry* tables.

const habitEntryInclude = {
  entryType: { select: { slug: true } },
  weekdays: true,
} as const;

type HabitListFilters = {
  status?: "active" | "archived";
  query?: string;
  category?: string;
  kind?: NormalizedCreateHabitInput["kind"];
};

function buildHabitEntryWhere(params: {
  userId: string;
  habitId?: string;
  filters?: HabitListFilters;
}): Prisma.EntryWhereInput {
  const where: Prisma.EntryWhereInput = {
    userId: params.userId,
    entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } },
  };

  if (params.habitId) {
    where.id = params.habitId;
  }

  if (params.filters?.status) {
    where.isActive = params.filters.status === "active";
  }

  if (params.filters?.category) {
    where.category = params.filters.category;
  }

  if (params.filters?.kind) {
    where.entryType = { slug: habitKindToSlug(params.filters.kind) };
  }

  if (params.filters?.query) {
    where.OR = [{ name: { contains: params.filters.query } }, { category: { contains: params.filters.query } }];
  }

  return where;
}

async function resolveHabitEntryTypeId(db: PrismaClient, kind: NormalizedCreateHabitInput["kind"]): Promise<string> {
  const entryType = await findEntryTypeBySlug(db, habitKindToSlug(kind));
  if (!entryType) {
    throw new Error(`Built-in EntryType not seeded for habit kind: ${kind}`);
  }
  return entryType.id;
}

export async function createHabitRecord(
  db: PrismaClient,
  params: {
    userId: string;
    habit: NormalizedCreateHabitInput;
  },
): Promise<MappedHabit> {
  const { userId, habit } = params;
  const entryTypeId = await resolveHabitEntryTypeId(db, habit.kind);

  const entry = await db.entry.create({
    data: {
      userId,
      entryTypeId,
      name: habit.name,
      description: habit.description,
      category: habit.category,
      config: buildHabitConfig(habit),
      startDate: habit.startDate,
      isActive: habit.isActive,
      weekdays: habit.weekdays.length ? { create: habit.weekdays.map((day) => ({ day })) } : undefined,
    },
    include: habitEntryInclude,
  });

  return mapEntryToHabit(entry);
}

export async function listHabitRecordsByFilter(
  db: PrismaClient,
  params: {
    userId: string;
    filters?: HabitListFilters;
  },
): Promise<MappedHabit[]> {
  const entries = await db.entry.findMany({
    where: buildHabitEntryWhere(params),
    orderBy: { createdAt: "asc" },
    include: habitEntryInclude,
  });

  return entries.map((entry) => mapEntryToHabit(entry));
}

export async function findOwnedHabitRecord(
  db: PrismaClient,
  params: {
    userId: string;
    habitId: string;
  },
): Promise<MappedHabit | null> {
  const entry = await db.entry.findFirst({
    where: buildHabitEntryWhere(params),
    include: habitEntryInclude,
  });

  return entry ? mapEntryToHabit(entry) : null;
}

export async function findOwnedHabitDetailRecord(
  db: PrismaClient,
  params: {
    userId: string;
    habitId: string;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<(MappedHabit & { user: { timezone: string }; dayStates: Array<{ dateKey: string; value: number | null; completed: boolean }> }) | null> {
  const entry = await db.entry.findFirst({
    where: buildHabitEntryWhere(params),
    include: {
      ...habitEntryInclude,
      user: { select: { timezone: true } },
      // Habit check-ins write at most one EntryEvent per (entryId, dateKey), so this
      // is the direct analogue of the legacy HabitDayState range query.
      events: {
        where: { dateKey: { gte: params.rangeStart, lte: params.rangeEnd } },
        orderBy: { dateKey: "asc" },
      },
    },
  });

  if (!entry) {
    return null;
  }

  return {
    ...mapEntryToHabit(entry),
    user: { timezone: entry.user.timezone },
    dayStates: entry.events.map((event) => ({
      dateKey: event.dateKey,
      value: event.value === null ? null : Number(event.value),
      completed: event.completed ?? false,
    })),
  };
}

export async function updateHabitRecord(
  db: PrismaClient,
  params: {
    habitId: string;
    habit: NormalizedCreateHabitInput;
  },
): Promise<MappedHabit> {
  // The kind cannot change on update (the habit contract has no kind patch), so the
  // entryType stays put; only config + weekdays are rewritten.
  const entry = await db.entry.update({
    where: { id: params.habitId },
    data: {
      name: params.habit.name,
      description: params.habit.description,
      category: params.habit.category,
      config: buildHabitConfig(params.habit),
      startDate: params.habit.startDate,
      isActive: params.habit.isActive,
      weekdays: {
        deleteMany: {},
        ...(params.habit.weekdays.length ? { create: params.habit.weekdays.map((day) => ({ day })) } : {}),
      },
    },
    include: habitEntryInclude,
  });

  return mapEntryToHabit(entry);
}

export async function setHabitActiveState(
  db: PrismaClient,
  params: {
    habitId: string;
    isActive: boolean;
  },
): Promise<MappedHabit> {
  const entry = await db.entry.update({
    where: { id: params.habitId },
    data: { isActive: params.isActive },
    include: habitEntryInclude,
  });

  return mapEntryToHabit(entry);
}
