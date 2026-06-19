import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";
import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit, type EntryRowForHabit } from "../habits/habit-entry-adapter";

// Habit sharing lives on CircleEntryShare/Entry/EntryEvent. These functions keep
// their legacy names and `.habit` sub-shape so circle.service is unchanged; the
// `habitId` they receive is the Entry id.

export type CircleRecord = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  contestStartAt: Date | null;
  contestEndAt: Date | null;
  season: string | null;
  leaderboardMode: string;
  contestKind: string;
  metricEntryTypeSlug: string | null;
  metricField: string | null;
  metricMode: string | null;
  metricTarget: number | null;
  metricGoal: string | null;
  cohortId: string | null;
};

type CircleRow = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  contestStartAt: string | null;
  contestEndAt: string | null;
  season: string | null;
  leaderboardMode: string;
  contestKind: string;
  metricEntryTypeSlug: string | null;
  metricField: string | null;
  metricMode: string | null;
  metricTarget: number | null;
  metricGoal: string | null;
  cohortId: string | null;
};

function mapCircle(row: CircleRow): CircleRecord {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    status: row.status,
    contestStartAt: row.contestStartAt ? new Date(row.contestStartAt) : null,
    contestEndAt: row.contestEndAt ? new Date(row.contestEndAt) : null,
    season: row.season,
    leaderboardMode: row.leaderboardMode,
    contestKind: row.contestKind,
    metricEntryTypeSlug: row.metricEntryTypeSlug,
    metricField: row.metricField,
    metricMode: row.metricMode,
    metricTarget: row.metricTarget,
    metricGoal: row.metricGoal,
    cohortId: row.cohortId,
  };
}

export type MembershipRecord = {
  id: string;
  circleId: string;
  userId: string;
  role: string;
  externalId: string | null;
  joinedAt: Date;
};

type MembershipRow = {
  id: string;
  circleId: string;
  userId: string;
  role: string;
  externalId: string | null;
  joinedAt: string;
};

function mapMembership(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    circleId: row.circleId,
    userId: row.userId,
    role: row.role,
    externalId: row.externalId,
    joinedAt: new Date(row.joinedAt),
  };
}

function loadCircle(db: Db, id: string): CircleRecord {
  const row = db.get<CircleRow>(`SELECT * FROM "Circle" WHERE "id" = ?`, [id]);
  if (!row) throw new Error(`Circle not found after write: ${id}`);
  return mapCircle(row);
}

export async function createCircleRecord(db: Db, params: { ownerId: string; name: string }): Promise<CircleRecord> {
  const id = newId();
  const now = nowDb();
  db.transaction(() => {
    db.run(`INSERT INTO "Circle" ("id", "name", "ownerId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`, [
      id,
      params.name,
      params.ownerId,
      now,
      now,
    ]);
    db.run(`INSERT INTO "CircleMembership" ("id", "circleId", "userId", "role", "joinedAt") VALUES (?, ?, ?, 'owner', ?)`, [
      newId(),
      id,
      params.ownerId,
      now,
    ]);
  });
  return loadCircle(db, id);
}

export async function createCircleWithLifecycle(
  db: Db,
  params: {
    ownerId: string;
    name: string;
    season?: string | null;
    contestStartAt?: Date | null;
    contestEndAt?: Date | null;
  },
): Promise<CircleRecord> {
  const id = newId();
  const now = nowDb();
  db.transaction(() => {
    db.run(
      `INSERT INTO "Circle" ("id", "name", "ownerId", "season", "contestStartAt", "contestEndAt", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.name,
        params.ownerId,
        params.season ?? null,
        params.contestStartAt ? params.contestStartAt.toISOString() : null,
        params.contestEndAt ? params.contestEndAt.toISOString() : null,
        now,
        now,
      ],
    );
    db.run(`INSERT INTO "CircleMembership" ("id", "circleId", "userId", "role", "joinedAt") VALUES (?, ?, ?, 'owner', ?)`, [
      newId(),
      id,
      params.ownerId,
      now,
    ]);
  });
  return loadCircle(db, id);
}

export async function updateCircleLifecycle(
  db: Db,
  circleId: string,
  patch: {
    status?: string;
    season?: string | null;
    contestStartAt?: Date | null;
    contestEndAt?: Date | null;
    leaderboardMode?: string;
  },
): Promise<CircleRecord> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.status !== undefined) {
    sets.push(`"status" = ?`);
    args.push(patch.status);
  }
  if (patch.season !== undefined) {
    sets.push(`"season" = ?`);
    args.push(patch.season);
  }
  if (patch.contestStartAt !== undefined) {
    sets.push(`"contestStartAt" = ?`);
    args.push(patch.contestStartAt ? patch.contestStartAt.toISOString() : null);
  }
  if (patch.contestEndAt !== undefined) {
    sets.push(`"contestEndAt" = ?`);
    args.push(patch.contestEndAt ? patch.contestEndAt.toISOString() : null);
  }
  if (patch.leaderboardMode !== undefined) {
    sets.push(`"leaderboardMode" = ?`);
    args.push(patch.leaderboardMode);
  }
  if (sets.length > 0) {
    sets.push(`"updatedAt" = ?`);
    args.push(nowDb());
    args.push(circleId);
    db.run(`UPDATE "Circle" SET ${sets.join(", ")} WHERE "id" = ?`, args);
  }
  return loadCircle(db, circleId);
}

export async function countCircleMembers(db: Db, circleId: string): Promise<number> {
  return db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "CircleMembership" WHERE "circleId" = ?`, [circleId])?.c ?? 0;
}

export async function listCirclesByUserId(db: Db, userId: string): Promise<CircleRecord[]> {
  // `disabled` circles are hidden from members entirely — they never appear in
  // anyone's list (admins still see them via the admin API to re-enable).
  return db
    .all<CircleRow>(
      `SELECT c.* FROM "Circle" c
       WHERE c."status" != 'disabled'
         AND EXISTS (SELECT 1 FROM "CircleMembership" m WHERE m."circleId" = c."id" AND m."userId" = ?)
       ORDER BY c."createdAt" ASC`,
      [userId],
    )
    .map(mapCircle);
}

export async function findCircleRecord(db: Db, circleId: string): Promise<CircleRecord | null> {
  const row = db.get<CircleRow>(`SELECT * FROM "Circle" WHERE "id" = ?`, [circleId]);
  return row ? mapCircle(row) : null;
}

export async function listCircleMemberRecords(db: Db, circleId: string) {
  return db
    .all<MembershipRow & { userName: string }>(
      `SELECT m.*, u."name" AS "userName" FROM "CircleMembership" m JOIN "User" u ON u."id" = m."userId"
       WHERE m."circleId" = ? ORDER BY m."joinedAt" ASC`,
      [circleId],
    )
    .map((row) => ({ ...mapMembership(row), user: { id: row.userId, name: row.userName } }));
}

export async function findCircleMembershipByUserId(
  db: Db,
  params: { circleId: string; userId: string },
): Promise<MembershipRecord | null> {
  const row = db.get<MembershipRow>(
    `SELECT * FROM "CircleMembership" WHERE "circleId" = ? AND "userId" = ? LIMIT 1`,
    [params.circleId, params.userId],
  );
  return row ? mapMembership(row) : null;
}

export async function findCircleMembershipByExternalId(
  db: Db,
  params: { circleId: string; externalId: string },
): Promise<MembershipRecord | null> {
  const row = db.get<MembershipRow>(
    `SELECT * FROM "CircleMembership" WHERE "circleId" = ? AND "externalId" = ? LIMIT 1`,
    [params.circleId, params.externalId],
  );
  return row ? mapMembership(row) : null;
}

export async function findCircleMembershipById(db: Db, params: { circleId: string; membershipId: string }) {
  const row = db.get<MembershipRow & { userName: string }>(
    `SELECT m.*, u."name" AS "userName" FROM "CircleMembership" m JOIN "User" u ON u."id" = m."userId"
     WHERE m."id" = ? AND m."circleId" = ? LIMIT 1`,
    [params.membershipId, params.circleId],
  );
  return row ? { ...mapMembership(row), user: { id: row.userId, name: row.userName } } : null;
}

export async function findUserByEmail(db: Db, email: string) {
  return db.get<{ id: string; name: string; email: string }>(
    `SELECT "id", "name", "email" FROM "User" WHERE "email" = ? LIMIT 1`,
    [email],
  );
}

export async function findUserByExternalId(db: Db, externalId: string) {
  return db.get<{ id: string }>(`SELECT "id" FROM "User" WHERE "externalId" = ? LIMIT 1`, [externalId]);
}

function requireMembershipWithUser(db: Db, membershipId: string) {
  const row = db.get<MembershipRow & { userName: string }>(
    `SELECT m.*, u."name" AS "userName" FROM "CircleMembership" m JOIN "User" u ON u."id" = m."userId" WHERE m."id" = ?`,
    [membershipId],
  );
  if (!row) throw new Error(`CircleMembership not found after write: ${membershipId}`);
  return { ...mapMembership(row), user: { id: row.userId, name: row.userName } };
}

export async function addCircleMemberRecord(
  db: Db,
  params: { circleId: string; userId: string; externalId?: string | null },
) {
  const id = newId();
  db.run(
    `INSERT INTO "CircleMembership" ("id", "circleId", "userId", "role", "externalId", "joinedAt") VALUES (?, ?, ?, 'member', ?, ?)`,
    [id, params.circleId, params.userId, params.externalId ?? null, nowDb()],
  );
  return requireMembershipWithUser(db, id);
}

export async function updateCircleMemberRecord(
  db: Db,
  params: { membershipId: string; role?: string; externalId?: string | null },
) {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (params.role !== undefined) {
    sets.push(`"role" = ?`);
    args.push(params.role);
  }
  if (params.externalId !== undefined) {
    sets.push(`"externalId" = ?`);
    args.push(params.externalId);
  }
  if (sets.length > 0) {
    args.push(params.membershipId);
    db.run(`UPDATE "CircleMembership" SET ${sets.join(", ")} WHERE "id" = ?`, args);
  }
  return requireMembershipWithUser(db, params.membershipId);
}

export async function removeCircleMemberRecord(db: Db, membershipId: string): Promise<void> {
  db.run(`DELETE FROM "CircleMembership" WHERE "id" = ?`, [membershipId]);
}

export async function createCircleHabitShareRecord(db: Db, params: { circleId: string; habitId: string }) {
  const id = newId();
  const now = nowDb();
  db.run(`INSERT INTO "CircleEntryShare" ("id", "circleId", "entryId", "createdAt") VALUES (?, ?, ?, ?)`, [
    id,
    params.circleId,
    params.habitId,
    now,
  ]);
  return { id, circleId: params.circleId, entryId: params.habitId, createdAt: new Date(now) };
}

export async function removeCircleHabitShareRecord(db: Db, params: { circleId: string; habitId: string }): Promise<void> {
  db.run(`DELETE FROM "CircleEntryShare" WHERE "circleId" = ? AND "entryId" = ?`, [params.circleId, params.habitId]);
}

export async function listCircleHabitSharesByUser(db: Db, params: { circleId: string; userId: string }) {
  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  const shares = db.all<{ id: string; name: string }>(
    `SELECT e."id" AS "id", e."name" AS "name" FROM "CircleEntryShare" s
     JOIN "Entry" e ON e."id" = s."entryId"
     JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE s."circleId" = ? AND e."userId" = ? AND et."slug" IN (${placeholders})
     ORDER BY s."createdAt" ASC`,
    [params.circleId, params.userId, ...HABIT_ENTRY_TYPE_SLUGS],
  );
  return shares.map((share) => ({ habit: { id: share.id, name: share.name } }));
}

export async function findCirclesForEntries(
  db: Db,
  entryIds: string[],
): Promise<Map<string, Array<{ circleId: string; name: string }>>> {
  const result = new Map<string, Array<{ circleId: string; name: string }>>();
  if (entryIds.length === 0) return result;

  const placeholders = entryIds.map(() => "?").join(", ");
  const shares = db.all<{ entryId: string; circleId: string; name: string }>(
    `SELECT s."entryId" AS "entryId", c."id" AS "circleId", c."name" AS "name"
     FROM "CircleEntryShare" s JOIN "Circle" c ON c."id" = s."circleId"
     WHERE s."entryId" IN (${placeholders})`,
    entryIds,
  );

  for (const share of shares) {
    const list = result.get(share.entryId) ?? [];
    list.push({ circleId: share.circleId, name: share.name });
    result.set(share.entryId, list);
  }
  return result;
}

export async function findCircleHabitShare(db: Db, params: { circleId: string; habitId: string }) {
  return db.get<{ id: string; circleId: string; entryId: string; createdAt: string }>(
    `SELECT * FROM "CircleEntryShare" WHERE "circleId" = ? AND "entryId" = ? LIMIT 1`,
    [params.circleId, params.habitId],
  );
}

export async function findHabitForCircle(db: Db, habitId: string) {
  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  return db.get<{ id: string; userId: string; isActive: number }>(
    `SELECT e."id", e."userId", e."isActive" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE e."id" = ? AND et."slug" IN (${placeholders}) LIMIT 1`,
    [habitId, ...HABIT_ENTRY_TYPE_SLUGS],
  );
}

type EntryEventRow = { dateKey: string; value: unknown; completed: number | null };

function mapEventsToDayStates(events: EntryEventRow[]) {
  return events.map((event) => ({
    dateKey: event.dateKey,
    value: event.value === null || event.value === undefined ? null : Number(event.value),
    completed: event.completed === null || event.completed === undefined ? false : event.completed !== 0,
  }));
}

type ShareEntryRow = {
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

function shareEntryToHabit(db: Db, row: ShareEntryRow): EntryRowForHabit {
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
    weekdays: db.all<{ day: string }>(`SELECT "day" FROM "EntryWeekday" WHERE "entryId" = ?`, [row.id]),
  };
}

export async function getCircleLeaderboardData(
  db: Db,
  params: { circleId: string; rangeStart: string; todayKey: string },
) {
  const memberships = db
    .all<MembershipRow & { userName: string; timezone: string }>(
      `SELECT m.*, u."name" AS "userName", u."timezone" AS "timezone"
       FROM "CircleMembership" m JOIN "User" u ON u."id" = m."userId"
       WHERE m."circleId" = ? ORDER BY m."joinedAt" ASC`,
      [params.circleId],
    )
    .map((row) => ({ ...mapMembership(row), user: { id: row.userId, name: row.userName, timezone: row.timezone } }));

  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  const shareRows = db.all<ShareEntryRow>(
    `SELECT e.*, et."slug" AS "entryTypeSlug" FROM "CircleEntryShare" s
     JOIN "Entry" e ON e."id" = s."entryId"
     JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE s."circleId" = ? AND e."isActive" = 1 AND et."slug" IN (${placeholders})`,
    [params.circleId, ...HABIT_ENTRY_TYPE_SLUGS],
  );

  const shares = shareRows.map((row) => {
    const habit = mapEntryToHabit(shareEntryToHabit(db, row));
    const events = db.all<EntryEventRow>(
      `SELECT "dateKey", "value", "completed" FROM "EntryEvent" WHERE "entryId" = ? AND "dateKey" >= ? AND "dateKey" <= ?`,
      [row.id, params.rangeStart, params.todayKey],
    );
    return {
      habit: {
        userId: row.userId,
        frequencyType: habit.frequencyType,
        frequencyCount: habit.frequencyCount,
        weekdays: habit.weekdays,
        dayStates: mapEventsToDayStates(events),
      },
    };
  });

  return { memberships, shares };
}

export async function findCircleTokenRecord(db: Db, params: { circleId: string; tokenId: string }) {
  const row = db.get<{ id: string; circleId: string; label: string | null; createdAt: string; updatedAt: string }>(
    `SELECT "id", "circleId", "label", "createdAt", "updatedAt" FROM "CircleToken" WHERE "id" = ? AND "circleId" = ? LIMIT 1`,
    [params.tokenId, params.circleId],
  );
  return row ? { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) } : null;
}

export async function listSharedHabitsWithTodayState(
  db: Db,
  params: { circleId: string; userId: string; todayKey: string },
) {
  const placeholders = HABIT_ENTRY_TYPE_SLUGS.map(() => "?").join(", ");
  const shareRows = db.all<ShareEntryRow>(
    `SELECT e.*, et."slug" AS "entryTypeSlug" FROM "CircleEntryShare" s
     JOIN "Entry" e ON e."id" = s."entryId"
     JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE s."circleId" = ? AND e."userId" = ? AND e."isActive" = 1 AND et."slug" IN (${placeholders})
     ORDER BY s."createdAt" ASC`,
    [params.circleId, params.userId, ...HABIT_ENTRY_TYPE_SLUGS],
  );

  return shareRows.map((row) => {
    const events = db.all<EntryEventRow>(
      `SELECT "dateKey", "value", "completed" FROM "EntryEvent" WHERE "entryId" = ? AND "dateKey" = ?`,
      [row.id, params.todayKey],
    );
    return {
      habit: { ...mapEntryToHabit(shareEntryToHabit(db, row)), dayStates: mapEventsToDayStates(events) },
    };
  });
}
