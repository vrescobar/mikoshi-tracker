import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";
import { getEntryTypeBySlug } from "../entry-types/entry-type.repository";
import {
  buildHabitConfig,
  habitKindToSlug,
  HABIT_ENTRY_TYPE_SLUGS,
  mapEntryToHabit,
  type EntryRowForHabit,
  type MappedHabit,
} from "./habit-entry-adapter";
import type { NormalizedCreateHabitInput } from "./habit.schema";

// Habits are stored as `Entry` rows of type habit_boolean/habit_quantity. These
// repository functions keep their legacy names and return shapes (consumed by the
// unchanged habit.service) but read/write the generic Entry* tables via bun:sqlite.

type HabitListFilters = {
  status?: "active" | "archived";
  query?: string;
  category?: string;
  kind?: NormalizedCreateHabitInput["kind"];
};

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

const SELECT_HABIT = `SELECT e.*, et."slug" AS "entryTypeSlug" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"`;

function loadWeekdays(db: Db, entryId: string): { day: string }[] {
  return db.all<{ day: string }>(`SELECT "day" FROM "EntryWeekday" WHERE "entryId" = ?`, [entryId]);
}

function toEntryRowForHabit(db: Db, row: EntryRow): EntryRowForHabit {
  return {
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
    weekdays: loadWeekdays(db, row.id),
  };
}

function buildHabitWhere(params: {
  userId: string;
  habitId?: string;
  filters?: HabitListFilters;
}): { sql: string; args: unknown[] } {
  const clauses: string[] = [`e."userId" = ?`];
  const args: unknown[] = [params.userId];

  // Habits are always entries of the habit_* types.
  if (params.filters?.kind) {
    clauses.push(`et."slug" = ?`);
    args.push(habitKindToSlug(params.filters.kind));
  } else {
    clauses.push(`et."slug" IN (${HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ")})`);
    args.push(...HABIT_ENTRY_TYPE_SLUGS);
  }

  if (params.habitId) {
    clauses.push(`e."id" = ?`);
    args.push(params.habitId);
  }
  if (params.filters?.status) {
    clauses.push(`e."isActive" = ?`);
    args.push(params.filters.status === "active" ? 1 : 0);
  }
  if (params.filters?.category) {
    clauses.push(`e."category" = ?`);
    args.push(params.filters.category);
  }
  if (params.filters?.query) {
    const like = `%${params.filters.query}%`;
    clauses.push(`(e."name" LIKE ? OR e."category" LIKE ?)`);
    args.push(like, like);
  }

  return { sql: clauses.join(" AND "), args };
}

async function resolveHabitEntryTypeId(db: Db, kind: NormalizedCreateHabitInput["kind"]): Promise<string> {
  const entryType = getEntryTypeBySlug(db, habitKindToSlug(kind));
  if (!entryType) {
    throw new Error(`Built-in EntryType not seeded for habit kind: ${kind}`);
  }
  return entryType.id;
}

function requireHabit(db: Db, habitId: string): MappedHabit {
  const row = db.get<EntryRow>(`${SELECT_HABIT} WHERE e."id" = ?`, [habitId]);
  if (!row) throw new Error(`Habit entry not found after write: ${habitId}`);
  return mapEntryToHabit(toEntryRowForHabit(db, row));
}

function writeWeekdays(db: Db, entryId: string, weekdays: string[]): void {
  for (const day of weekdays) {
    db.run(`INSERT INTO "EntryWeekday" ("id", "entryId", "day") VALUES (?, ?, ?)`, [newId(), entryId, day]);
  }
}

export async function createHabitRecord(
  db: Db,
  params: { userId: string; habit: NormalizedCreateHabitInput },
): Promise<MappedHabit> {
  const { userId, habit } = params;
  const entryTypeId = await resolveHabitEntryTypeId(db, habit.kind);
  const id = newId();
  const now = nowDb();
  db.transaction(() => {
    db.run(
      `INSERT INTO "Entry"
         ("id", "userId", "entryTypeId", "name", "description", "category", "config", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        entryTypeId,
        habit.name,
        habit.description,
        habit.category,
        buildHabitConfig(habit),
        habit.startDate,
        habit.isActive ? 1 : 0,
        now,
        now,
      ],
    );
    writeWeekdays(db, id, habit.weekdays);
  });
  return requireHabit(db, id);
}

export async function listHabitRecordsByFilter(
  db: Db,
  params: { userId: string; filters?: HabitListFilters },
): Promise<MappedHabit[]> {
  const { sql, args } = buildHabitWhere(params);
  const rows = db.all<EntryRow>(`${SELECT_HABIT} WHERE ${sql} ORDER BY e."createdAt" ASC`, args);
  return rows.map((row) => mapEntryToHabit(toEntryRowForHabit(db, row)));
}

export async function findOwnedHabitRecord(
  db: Db,
  params: { userId: string; habitId: string },
): Promise<MappedHabit | null> {
  const { sql, args } = buildHabitWhere(params);
  const row = db.get<EntryRow>(`${SELECT_HABIT} WHERE ${sql} LIMIT 1`, args);
  return row ? mapEntryToHabit(toEntryRowForHabit(db, row)) : null;
}

export async function findOwnedHabitDetailRecord(
  db: Db,
  params: { userId: string; habitId: string; rangeStart: string; rangeEnd: string },
): Promise<
  | (MappedHabit & {
      user: { timezone: string };
      dayStates: Array<{ dateKey: string; value: number | null; completed: boolean }>;
    })
  | null
> {
  const { sql, args } = buildHabitWhere({ userId: params.userId, habitId: params.habitId });
  const row = db.get<EntryRow>(`${SELECT_HABIT} WHERE ${sql} LIMIT 1`, args);
  if (!row) return null;

  const user = db.get<{ timezone: string }>(`SELECT "timezone" FROM "User" WHERE "id" = ?`, [row.userId]);
  const events = db.all<{ dateKey: string; value: number | null; completed: number | null }>(
    `SELECT "dateKey", "value", "completed" FROM "EntryEvent"
     WHERE "entryId" = ? AND "dateKey" >= ? AND "dateKey" <= ? ORDER BY "dateKey" ASC`,
    [row.id, params.rangeStart, params.rangeEnd],
  );

  return {
    ...mapEntryToHabit(toEntryRowForHabit(db, row)),
    user: { timezone: user?.timezone ?? "UTC" },
    dayStates: events.map((event) => ({
      dateKey: event.dateKey,
      value: event.value === null || event.value === undefined ? null : Number(event.value),
      completed: event.completed === null || event.completed === undefined ? false : event.completed !== 0,
    })),
  };
}

export async function updateHabitRecord(
  db: Db,
  params: { habitId: string; habit: NormalizedCreateHabitInput },
): Promise<MappedHabit> {
  const now = nowDb();
  db.transaction(() => {
    db.run(
      `UPDATE "Entry" SET "name" = ?, "description" = ?, "category" = ?, "config" = ?, "startDate" = ?, "isActive" = ?, "updatedAt" = ? WHERE "id" = ?`,
      [
        params.habit.name,
        params.habit.description,
        params.habit.category,
        buildHabitConfig(params.habit),
        params.habit.startDate,
        params.habit.isActive ? 1 : 0,
        now,
        params.habitId,
      ],
    );
    db.run(`DELETE FROM "EntryWeekday" WHERE "entryId" = ?`, [params.habitId]);
    writeWeekdays(db, params.habitId, params.habit.weekdays);
  });
  return requireHabit(db, params.habitId);
}

export async function setHabitActiveState(
  db: Db,
  params: { habitId: string; isActive: boolean },
): Promise<MappedHabit> {
  db.run(`UPDATE "Entry" SET "isActive" = ?, "updatedAt" = ? WHERE "id" = ?`, [
    params.isActive ? 1 : 0,
    nowDb(),
    params.habitId,
  ]);
  return requireHabit(db, params.habitId);
}
