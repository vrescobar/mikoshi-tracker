import type { Db } from "../../db/client";

type Deps = { sqlite: Db };
type Page = { limit?: number; offset?: number; q?: string };

function limitOffset(page: Page): [number, number] {
  return [page.limit ?? 100, page.offset ?? 0];
}

export async function listAllUsers(deps: Deps, page: Page) {
  const db = deps.sqlite;
  const [limit, offset] = limitOffset(page);
  const where = page.q ? `WHERE ("name" LIKE ? OR "email" LIKE ? OR "externalId" LIKE ?)` : "";
  const whereArgs = page.q ? [`%${page.q}%`, `%${page.q}%`, `%${page.q}%`] : [];
  const total = db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "User" ${where}`, whereArgs)?.c ?? 0;
  const rows = db.all<{
    id: string;
    name: string;
    email: string;
    externalId: string | null;
    isAdmin: number;
    timezone: string;
    createdAt: string;
  }>(`SELECT * FROM "User" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, [...whereArgs, limit, offset]);
  return {
    total,
    items: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      externalId: u.externalId,
      isAdmin: u.isAdmin !== 0,
      timezone: u.timezone,
      createdAt: new Date(u.createdAt).toISOString(),
    })),
  };
}

export async function listAllCircles(deps: Deps, page: Page) {
  const db = deps.sqlite;
  const [limit, offset] = limitOffset(page);
  const where = page.q ? `WHERE c."name" LIKE ?` : "";
  const whereArgs = page.q ? [`%${page.q}%`] : [];
  const total = db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "Circle" c ${where}`, whereArgs)?.c ?? 0;
  const rows = db.all<{
    id: string;
    name: string;
    ownerId: string;
    status: string;
    season: string | null;
    contestStartAt: string | null;
    contestEndAt: string | null;
    leaderboardMode: string;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
  }>(
    `SELECT c.*, (SELECT COUNT(*) FROM "CircleMembership" m WHERE m."circleId" = c."id") AS "memberCount"
     FROM "Circle" c ${where} ORDER BY c."createdAt" DESC LIMIT ? OFFSET ?`,
    [...whereArgs, limit, offset],
  );
  return {
    total,
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      status: c.status as "active" | "closed" | "archived",
      season: c.season,
      contestStartAt: c.contestStartAt ? new Date(c.contestStartAt).toISOString() : null,
      contestEndAt: c.contestEndAt ? new Date(c.contestEndAt).toISOString() : null,
      leaderboardMode: c.leaderboardMode as "rolling" | "snapshot",
      memberCount: c.memberCount,
      createdAt: new Date(c.createdAt).toISOString(),
      updatedAt: new Date(c.updatedAt).toISOString(),
    })),
  };
}

export async function listAllEntries(deps: Deps, page: Page & { userId?: string; entryTypeSlug?: string }) {
  const db = deps.sqlite;
  const [limit, offset] = limitOffset(page);
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (page.userId) {
    clauses.push(`e."userId" = ?`);
    args.push(page.userId);
  }
  if (page.entryTypeSlug) {
    clauses.push(`et."slug" = ?`);
    args.push(page.entryTypeSlug);
  }
  if (page.q) {
    clauses.push(`e."name" LIKE ?`);
    args.push(`%${page.q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const join = `FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"`;
  const total = db.get<{ c: number }>(`SELECT COUNT(*) AS c ${join} ${where}`, args)?.c ?? 0;
  const rows = db.all<{ id: string; userId: string; slug: string; name: string; isActive: number; createdAt: string }>(
    `SELECT e."id", e."userId", et."slug" AS "slug", e."name", e."isActive", e."createdAt" ${join} ${where}
     ORDER BY e."createdAt" DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  return {
    total,
    items: rows.map((e) => ({
      id: e.id,
      userId: e.userId,
      entryTypeSlug: e.slug,
      name: e.name,
      isActive: e.isActive !== 0,
      createdAt: new Date(e.createdAt).toISOString(),
    })),
  };
}

export async function listAllEvents(deps: Deps, page: Page & { userId?: string; from?: string; to?: string }) {
  const db = deps.sqlite;
  const [limit, offset] = limitOffset(page);
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (page.userId) {
    clauses.push(`"userId" = ?`);
    args.push(page.userId);
  }
  if (page.from) {
    clauses.push(`"dateKey" >= ?`);
    args.push(page.from);
  }
  if (page.to) {
    clauses.push(`"dateKey" <= ?`);
    args.push(page.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "EntryEvent" ${where}`, args)?.c ?? 0;
  const rows = db.all<{
    id: string;
    entryId: string;
    userId: string;
    occurredAt: string;
    dateKey: string;
    completed: number | null;
  }>(`SELECT * FROM "EntryEvent" ${where} ORDER BY "occurredAt" DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  return {
    total,
    items: rows.map((ev) => ({
      id: ev.id,
      entryId: ev.entryId,
      userId: ev.userId,
      occurredAt: new Date(ev.occurredAt).toISOString(),
      dateKey: ev.dateKey,
      completed: ev.completed === null || ev.completed === undefined ? null : ev.completed !== 0,
    })),
  };
}

export async function dashboardMetrics(deps: Deps) {
  const db = deps.sqlite;
  const count = (sql: string) => db.get<{ c: number }>(sql)?.c ?? 0;
  return {
    users: count(`SELECT COUNT(*) AS c FROM "User"`),
    circles: count(`SELECT COUNT(*) AS c FROM "Circle"`),
    activeCircles: count(`SELECT COUNT(*) AS c FROM "Circle" WHERE "status" = 'active'`),
    entries: count(`SELECT COUNT(*) AS c FROM "Entry"`),
    events: count(`SELECT COUNT(*) AS c FROM "EntryEvent"`),
    snapshots: count(`SELECT COUNT(*) AS c FROM "CircleLeaderboardSnapshot"`),
  };
}
