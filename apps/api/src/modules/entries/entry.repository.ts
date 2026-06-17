import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";
import { getEntryTypeBySlug, type EntryTypeRecord } from "../entry-types/entry-type.repository";

const WEEKDAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/** Entry plus the relations the serializers/adapters read (weekdays + entryType slug). */
export type EntryWithRelations = {
  id: string;
  userId: string;
  entryTypeId: string;
  name: string;
  description: string | null;
  category: string | null;
  config: string;
  startDate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  weekdays: { day: string }[];
  entryType: { slug: string };
};

export type EntryListFiltersInternal = {
  entryTypeSlug?: string;
  isActive?: boolean;
  query?: string;
};

type EntryRow = {
  id: string;
  userId: string;
  entryTypeId: string;
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

function loadWeekdays(db: Db, entryId: string): { day: string }[] {
  return db.all<{ day: string }>(`SELECT "day" FROM "EntryWeekday" WHERE "entryId" = ?`, [entryId]);
}

function mapEntry(db: Db, row: EntryRow): EntryWithRelations {
  return {
    id: row.id,
    userId: row.userId,
    entryTypeId: row.entryTypeId,
    name: row.name,
    description: row.description,
    category: row.category,
    config: row.config,
    startDate: row.startDate,
    isActive: row.isActive !== 0,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    weekdays: loadWeekdays(db, row.id),
    entryType: { slug: row.entryTypeSlug },
  };
}

const SELECT_ENTRY = `SELECT e.*, et."slug" AS "entryTypeSlug" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"`;

function buildEntryWhere(params: {
  userId: string;
  entryId?: string;
  filters?: EntryListFiltersInternal;
}): { sql: string; args: unknown[] } {
  const clauses: string[] = [`e."userId" = ?`];
  const args: unknown[] = [params.userId];

  if (params.entryId) {
    clauses.push(`e."id" = ?`);
    args.push(params.entryId);
  }

  if (params.filters?.entryTypeSlug) {
    const slugs = params.filters.entryTypeSlug
      .split(",")
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);
    if (slugs.length > 1) {
      clauses.push(`et."slug" IN (${slugs.map(() => "?").join(", ")})`);
      args.push(...slugs);
    } else {
      clauses.push(`et."slug" = ?`);
      args.push(slugs[0] ?? params.filters.entryTypeSlug);
    }
  }

  if (params.filters?.isActive !== undefined) {
    clauses.push(`e."isActive" = ?`);
    args.push(params.filters.isActive ? 1 : 0);
  }

  if (params.filters?.query) {
    const like = `%${params.filters.query}%`;
    clauses.push(`(e."name" LIKE ? OR e."category" LIKE ? OR e."description" LIKE ?)`);
    args.push(like, like, like);
  }

  return { sql: clauses.join(" AND "), args };
}

export function sortWeekdays(weekdays: Array<{ day: string }>): string[] {
  return weekdays
    .map((entry) => entry.day)
    .sort((left, right) => (WEEKDAY_ORDER[left] ?? 99) - (WEEKDAY_ORDER[right] ?? 99));
}

export async function findEntryTypeBySlug(db: Db, slug: string): Promise<EntryTypeRecord | null> {
  return getEntryTypeBySlug(db, slug);
}

export async function createEntryRecord(
  db: Db,
  params: {
    userId: string;
    entryTypeId: string;
    name: string;
    description: string | null;
    category: string | null;
    config: string;
    startDate: string;
    weekdays: string[];
  },
): Promise<EntryWithRelations> {
  const id = newId();
  const now = nowDb();
  db.transaction(() => {
    db.run(
      `INSERT INTO "Entry"
         ("id", "userId", "entryTypeId", "name", "description", "category", "config", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        params.userId,
        params.entryTypeId,
        params.name,
        params.description,
        params.category,
        params.config,
        params.startDate,
        now,
        now,
      ],
    );
    for (const day of params.weekdays) {
      db.run(`INSERT INTO "EntryWeekday" ("id", "entryId", "day") VALUES (?, ?, ?)`, [newId(), id, day]);
    }
  });
  return requireEntryById(db, id);
}

function requireEntryById(db: Db, entryId: string): EntryWithRelations {
  const row = db.get<EntryRow>(`${SELECT_ENTRY} WHERE e."id" = ?`, [entryId]);
  if (!row) throw new Error(`Entry not found after write: ${entryId}`);
  return mapEntry(db, row);
}

export async function findOwnedEntry(
  db: Db,
  params: { userId: string; entryId: string },
): Promise<EntryWithRelations | null> {
  const { sql, args } = buildEntryWhere(params);
  const row = db.get<EntryRow>(`${SELECT_ENTRY} WHERE ${sql} LIMIT 1`, args);
  return row ? mapEntry(db, row) : null;
}

export async function listEntries(
  db: Db,
  params: { userId: string; filters?: EntryListFiltersInternal },
): Promise<EntryWithRelations[]> {
  const { sql, args } = buildEntryWhere(params);
  const rows = db.all<EntryRow>(`${SELECT_ENTRY} WHERE ${sql} ORDER BY e."createdAt" ASC`, args);
  return rows.map((row) => mapEntry(db, row));
}

export async function updateEntryRecord(
  db: Db,
  params: {
    entryId: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    config?: string;
  },
): Promise<EntryWithRelations> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (params.name !== undefined) {
    sets.push(`"name" = ?`);
    args.push(params.name);
  }
  if (params.description !== undefined) {
    sets.push(`"description" = ?`);
    args.push(params.description);
  }
  if (params.category !== undefined) {
    sets.push(`"category" = ?`);
    args.push(params.category);
  }
  if (params.config !== undefined) {
    sets.push(`"config" = ?`);
    args.push(params.config);
  }
  sets.push(`"updatedAt" = ?`);
  args.push(nowDb());
  args.push(params.entryId);
  db.run(`UPDATE "Entry" SET ${sets.join(", ")} WHERE "id" = ?`, args);
  return requireEntryById(db, params.entryId);
}

export async function setEntryActive(
  db: Db,
  params: { entryId: string; isActive: boolean },
): Promise<EntryWithRelations> {
  db.run(`UPDATE "Entry" SET "isActive" = ?, "updatedAt" = ? WHERE "id" = ?`, [
    params.isActive ? 1 : 0,
    nowDb(),
    params.entryId,
  ]);
  return requireEntryById(db, params.entryId);
}
