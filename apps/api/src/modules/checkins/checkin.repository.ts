import type { Prisma, PrismaClient } from "../../generated/prisma/client";

import { buildHabitPayload, HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

export type PersistedCheckinHabit = {
  id: string;
  userId: string;
  isActive: boolean;
  name: string;
  kind: string;
  frequencyType: string;
  frequencyCount: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  user: {
    timezone: string;
  };
  weekdays: Array<{
    day: string;
  }>;
};

export type PersistedHabitDayState = {
  id: string;
  habitId: string;
  dateKey: string;
  value: number | null;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedCheckinMutation = {
  id: string;
  habitId: string;
  dayStateId: string;
  dateKey: string;
  type: string;
  source: string;
  note: string | null;
  previousValue: number | null;
  nextValue: number | null;
  previousCompleted: boolean;
  nextCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

const habitEntryInclude = {
  entryType: { select: { slug: true } },
  weekdays: true,
  user: { select: { timezone: true } },
} as const;

type HabitPayloadProjection = { value: number | null; completed: boolean };

function payloadProjection(payload: string | null): HabitPayloadProjection {
  if (!payload) {
    return { value: null, completed: false };
  }
  const parsed = JSON.parse(payload) as { value?: unknown; completed?: unknown };
  return {
    value: typeof parsed.value === "number" ? parsed.value : null,
    completed: typeof parsed.completed === "boolean" ? parsed.completed : false,
  };
}

export async function findOwnedHabitForCheckin(
  db: DbClient,
  params: {
    userId: string;
    habitId: string;
  },
): Promise<PersistedCheckinHabit> {
  const entry = await db.entry.findFirst({
    where: {
      id: params.habitId,
      userId: params.userId,
      entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } },
    },
    include: habitEntryInclude,
  });

  if (!entry) {
    throw new Error("Habit not found");
  }

  return {
    ...mapEntryToHabit(entry),
    user: { timezone: entry.user.timezone },
  };
}

export async function findHabitDayState(
  db: DbClient,
  params: {
    habitId: string;
    dateKey: string;
  },
): Promise<{ dateKey: string; value: number | null; completed: boolean } | null> {
  const event = await db.entryEvent.findFirst({
    where: { entryId: params.habitId, dateKey: params.dateKey },
  });

  if (!event) {
    return null;
  }

  return {
    dateKey: event.dateKey,
    value: event.value === null ? null : Number(event.value),
    completed: event.completed ?? false,
  };
}

export async function findLatestCheckinMutation(
  db: DbClient,
  params: {
    habitId: string;
    dateKey: string;
  },
): Promise<{ previousValue: number | null; previousCompleted: boolean; source: string } | null> {
  const mutation = await db.eventMutation.findFirst({
    where: { entryId: params.habitId, dateKey: params.dateKey },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  if (!mutation) {
    return null;
  }

  // The legacy undo restores to the prior state. Generic mutations record that state
  // in `previousPayload`; the very first (CREATE) has none → treat as the empty state.
  const projection = payloadProjection(mutation.previousPayload);
  return {
    previousValue: projection.value,
    previousCompleted: projection.completed,
    source: mutation.source,
  };
}

export async function persistCheckinMutation(
  db: PrismaClient,
  params: {
    habitId: string;
    userId: string;
    storedKind: string;
    dateKey: string;
    type: string;
    source: string;
    note: string | null;
    previousValue: number | null;
    nextValue: number | null;
    previousCompleted: boolean;
    nextCompleted: boolean;
  },
): Promise<{
  dayState: PersistedHabitDayState;
  mutation: PersistedCheckinMutation;
}> {
  const payload = buildHabitPayload(params.storedKind, params.nextValue, params.nextCompleted);
  const projectedValue = params.storedKind === "QUANTITY" ? (params.nextValue ?? 0) : null;

  return db.$transaction(async (tx) => {
    // habit_boolean/habit_quantity are recurring → at most one event per (entryId, dateKey),
    // mirroring the legacy HabitDayState upsert. First write is CREATE, later writes UPDATE,
    // an undo is UNDO. The EntryEvent/EventMutation written here are shape-identical to those
    // produced by events.service.persistEvent, so /api/events + aggregations see them uniformly.
    const existing = await tx.entryEvent.findFirst({
      where: { entryId: params.habitId, dateKey: params.dateKey },
    });

    const event = existing
      ? await tx.entryEvent.update({
          where: { id: existing.id },
          data: { payload, value: projectedValue, completed: params.nextCompleted },
        })
      : await tx.entryEvent.create({
          data: {
            entryId: params.habitId,
            userId: params.userId,
            occurredAt: new Date(),
            dateKey: params.dateKey,
            payload,
            value: projectedValue,
            completed: params.nextCompleted,
          },
        });

    const genericType = params.type === "UNDO" ? "UNDO" : existing ? "UPDATE" : "CREATE";

    const mutation = await tx.eventMutation.create({
      data: {
        entryId: params.habitId,
        eventId: event.id,
        userId: params.userId,
        dateKey: params.dateKey,
        type: genericType,
        source: params.source,
        note: params.note,
        previousPayload: existing ? existing.payload : null,
        nextPayload: payload,
      },
    });

    return {
      // Return the legacy snapshot shape the checkin service contract expects. The DB
      // stores generic CREATE/UPDATE/UNDO types; the returned `type` keeps the legacy
      // COMPLETE/SET_TOTAL/UNDO value passed in for backward compatibility.
      dayState: {
        id: event.id,
        habitId: params.habitId,
        dateKey: event.dateKey,
        value: event.value === null ? null : Number(event.value),
        completed: event.completed ?? false,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
      mutation: {
        id: mutation.id,
        habitId: params.habitId,
        dayStateId: event.id,
        dateKey: mutation.dateKey,
        type: params.type,
        source: mutation.source,
        note: mutation.note,
        previousValue: params.previousValue,
        nextValue: params.nextValue,
        previousCompleted: params.previousCompleted,
        nextCompleted: params.nextCompleted,
        createdAt: mutation.createdAt,
        updatedAt: mutation.createdAt,
      },
    };
  });
}
