import type { Db } from "../../db/client";
import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit, type EntryRowForHabit } from "../habits/habit-entry-adapter";

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

export async function findUserTimezone(db: Db, params: { userId: string }) {
  return db.get<{ timezone: string }>(`SELECT "timezone" FROM "User" WHERE "id" = ?`, [params.userId]);
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
};

export async function listActiveHabitStatsRecords(
  db: Db,
  params: { userId: string; rangeStart: string; rangeEnd: string },
): Promise<PersistedStatsHabitRecord[]> {
  // Habits are Entry rows of the habit_* types; their day states are EntryEvents.
  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  const rows = db.all<EntryRow>(
    `SELECT e.*, et."slug" AS "entryTypeSlug"
     FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE e."userId" = ? AND e."isActive" = 1 AND et."slug" IN (${placeholders})
     ORDER BY e."createdAt" ASC`,
    [params.userId, ...HABIT_ENTRY_TYPE_SLUGS],
  );

  return rows.map((row) => {
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
    const habit = mapEntryToHabit(entryForHabit);

    const events = db.all<{ dateKey: string; value: number | null; completed: number | null }>(
      `SELECT "dateKey", "value", "completed" FROM "EntryEvent"
       WHERE "entryId" = ? AND "dateKey" >= ? AND "dateKey" <= ? ORDER BY "dateKey" ASC`,
      [row.id, params.rangeStart, params.rangeEnd],
    );

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
      dayStates: events.map((event) => ({
        dateKey: event.dateKey,
        value: event.value === null || event.value === undefined ? null : Number(event.value),
        completed: event.completed === null || event.completed === undefined ? false : event.completed !== 0,
      })),
    };
  });
}
