import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";
import {
  buildHabitPayload,
  HABIT_ENTRY_TYPE_SLUGS,
  mapEntryToHabit,
  type EntryRowForHabit,
} from "../habits/habit-entry-adapter";

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

type EntryRow = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  config: string;
  startDate: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  entryTypeSlug: string;
  timezone: string;
};

export async function findOwnedHabitForCheckin(
  db: Db,
  params: { userId: string; habitId: string },
): Promise<PersistedCheckinHabit> {
  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  const row = db.get<EntryRow>(
    `SELECT e.*, et."slug" AS "entryTypeSlug", u."timezone" AS "timezone"
     FROM "Entry" e
     JOIN "EntryType" et ON et."id" = e."entryTypeId"
     JOIN "User" u ON u."id" = e."userId"
     WHERE e."id" = ? AND e."userId" = ? AND et."slug" IN (${placeholders}) LIMIT 1`,
    [params.habitId, params.userId, ...HABIT_ENTRY_TYPE_SLUGS],
  );

  if (!row) {
    throw new Error("Habit not found");
  }

  const weekdays = db.all<{ day: string }>(`SELECT "day" FROM "EntryWeekday" WHERE "entryId" = ?`, [row.id]);
  const entryForHabit: EntryRowForHabit = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    category: row.category,
    config: row.config,
    startDate: row.startDate,
    isActive: row.isActive !== 0,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    entryType: { slug: row.entryTypeSlug },
    weekdays,
  };

  return {
    ...mapEntryToHabit(entryForHabit),
    user: { timezone: row.timezone },
  };
}

export async function findHabitDayState(
  db: Db,
  params: { habitId: string; dateKey: string },
): Promise<{ dateKey: string; value: number | null; completed: boolean } | null> {
  const event = db.get<{ dateKey: string; value: number | null; completed: number | null }>(
    `SELECT "dateKey", "value", "completed" FROM "EntryEvent" WHERE "entryId" = ? AND "dateKey" = ? LIMIT 1`,
    [params.habitId, params.dateKey],
  );

  if (!event) {
    return null;
  }

  return {
    dateKey: event.dateKey,
    value: event.value === null || event.value === undefined ? null : Number(event.value),
    completed: event.completed === null || event.completed === undefined ? false : event.completed !== 0,
  };
}

export async function findLatestCheckinMutation(
  db: Db,
  params: { habitId: string; dateKey: string },
): Promise<{ previousValue: number | null; previousCompleted: boolean; source: string } | null> {
  const mutation = db.get<{ previousPayload: string | null; source: string }>(
    `SELECT "previousPayload", "source" FROM "EventMutation"
     WHERE "entryId" = ? AND "dateKey" = ? ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`,
    [params.habitId, params.dateKey],
  );

  if (!mutation) {
    return null;
  }

  const projection = payloadProjection(mutation.previousPayload);
  return {
    previousValue: projection.value,
    previousCompleted: projection.completed,
    source: mutation.source,
  };
}

export async function persistCheckinMutation(
  db: Db,
  params: {
    habitId: string;
    userId: string;
    storedKind: string;
    dateKey: string;
    type: string;
    source: string;
    note: string | null;
    onBehalfOfCircleId?: string | null;
    previousValue: number | null;
    nextValue: number | null;
    previousCompleted: boolean;
    nextCompleted: boolean;
  },
): Promise<{ dayState: PersistedHabitDayState; mutation: PersistedCheckinMutation }> {
  const payload = buildHabitPayload(params.storedKind, params.nextValue, params.nextCompleted);
  const projectedValue = params.storedKind === "QUANTITY" ? (params.nextValue ?? 0) : null;

  return db.transaction(() => {
    // habit_* are recurring → at most one event per (entryId, dateKey). The
    // EntryEvent/EventMutation written here are shape-identical to those produced
    // by events.service.persistEvent.
    const existing = db.get<{ id: string; payload: string }>(
      `SELECT "id", "payload" FROM "EntryEvent" WHERE "entryId" = ? AND "dateKey" = ? LIMIT 1`,
      [params.habitId, params.dateKey],
    );

    const now = nowDb();
    let eventId: string;
    if (existing) {
      eventId = existing.id;
      db.run(
        `UPDATE "EntryEvent" SET "payload" = ?, "value" = ?, "completed" = ?, "updatedAt" = ? WHERE "id" = ?`,
        [payload, projectedValue, params.nextCompleted ? 1 : 0, now, eventId],
      );
    } else {
      eventId = newId();
      db.run(
        `INSERT INTO "EntryEvent"
           ("id", "entryId", "userId", "occurredAt", "dateKey", "payload", "value", "completed", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, params.habitId, params.userId, now, params.dateKey, payload, projectedValue, params.nextCompleted ? 1 : 0, now, now],
      );
    }

    const event = db.get<{ id: string; dateKey: string; value: number | null; completed: number | null; createdAt: string; updatedAt: string }>(
      `SELECT "id", "dateKey", "value", "completed", "createdAt", "updatedAt" FROM "EntryEvent" WHERE "id" = ?`,
      [eventId],
    )!;

    const genericType = params.type === "UNDO" ? "UNDO" : existing ? "UPDATE" : "CREATE";
    const mutationId = newId();
    db.run(
      `INSERT INTO "EventMutation"
         ("id", "entryId", "eventId", "userId", "dateKey", "type", "source", "note", "onBehalfOfCircleId", "previousPayload", "nextPayload", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutationId,
        params.habitId,
        eventId,
        params.userId,
        params.dateKey,
        genericType,
        params.source,
        params.note,
        params.onBehalfOfCircleId ?? null,
        existing ? existing.payload : null,
        payload,
        now,
      ],
    );

    return {
      dayState: {
        id: event.id,
        habitId: params.habitId,
        dateKey: event.dateKey,
        value: event.value === null || event.value === undefined ? null : Number(event.value),
        completed: event.completed === null || event.completed === undefined ? false : event.completed !== 0,
        createdAt: new Date(event.createdAt),
        updatedAt: new Date(event.updatedAt),
      },
      mutation: {
        id: mutationId,
        habitId: params.habitId,
        dayStateId: event.id,
        dateKey: params.dateKey,
        type: params.type,
        source: params.source,
        note: params.note,
        previousValue: params.previousValue,
        nextValue: params.nextValue,
        previousCompleted: params.previousCompleted,
        nextCompleted: params.nextCompleted,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    };
  });
}
