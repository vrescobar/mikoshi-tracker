import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type Deps = { db: PrismaClient };
type Page = { limit?: number; offset?: number; q?: string };

function take(page: Page) {
  return { skip: page.offset ?? 0, take: page.limit ?? 100 };
}

export async function listAllUsers(deps: Deps, page: Page) {
  const where: Prisma.UserWhereInput = page.q
    ? { OR: [{ name: { contains: page.q } }, { email: { contains: page.q } }, { externalId: { contains: page.q } }] }
    : {};
  const [rows, total] = await Promise.all([
    deps.db.user.findMany({ where, orderBy: { createdAt: "desc" }, ...take(page) }),
    deps.db.user.count({ where }),
  ]);
  return {
    total,
    items: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      externalId: u.externalId,
      isAdmin: u.isAdmin,
      timezone: u.timezone,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

export async function listAllCircles(deps: Deps, page: Page) {
  const where: Prisma.CircleWhereInput = page.q ? { name: { contains: page.q } } : {};
  const [rows, total] = await Promise.all([
    deps.db.circle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memberships: true } } },
      ...take(page),
    }),
    deps.db.circle.count({ where }),
  ]);
  return {
    total,
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      status: c.status as "active" | "closed" | "archived",
      season: c.season,
      contestStartAt: c.contestStartAt?.toISOString() ?? null,
      contestEndAt: c.contestEndAt?.toISOString() ?? null,
      leaderboardMode: c.leaderboardMode as "rolling" | "snapshot",
      memberCount: c._count.memberships,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

export async function listAllEntries(deps: Deps, page: Page & { userId?: string; entryTypeSlug?: string }) {
  const where: Prisma.EntryWhereInput = {
    ...(page.userId ? { userId: page.userId } : {}),
    ...(page.entryTypeSlug ? { entryType: { slug: page.entryTypeSlug } } : {}),
    ...(page.q ? { name: { contains: page.q } } : {}),
  };
  const [rows, total] = await Promise.all([
    deps.db.entry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { entryType: { select: { slug: true } } },
      ...take(page),
    }),
    deps.db.entry.count({ where }),
  ]);
  return {
    total,
    items: rows.map((e) => ({
      id: e.id,
      userId: e.userId,
      entryTypeSlug: e.entryType.slug,
      name: e.name,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function listAllEvents(deps: Deps, page: Page & { userId?: string; from?: string; to?: string }) {
  const where: Prisma.EntryEventWhereInput = {
    ...(page.userId ? { userId: page.userId } : {}),
    ...(page.from || page.to
      ? { dateKey: { ...(page.from ? { gte: page.from } : {}), ...(page.to ? { lte: page.to } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    deps.db.entryEvent.findMany({ where, orderBy: { occurredAt: "desc" }, ...take(page) }),
    deps.db.entryEvent.count({ where }),
  ]);
  return {
    total,
    items: rows.map((ev) => ({
      id: ev.id,
      entryId: ev.entryId,
      userId: ev.userId,
      occurredAt: ev.occurredAt.toISOString(),
      dateKey: ev.dateKey,
      completed: ev.completed,
    })),
  };
}

export async function dashboardMetrics(deps: Deps) {
  const [users, circles, activeCircles, entries, events, snapshots] = await Promise.all([
    deps.db.user.count(),
    deps.db.circle.count(),
    deps.db.circle.count({ where: { status: "active" } }),
    deps.db.entry.count(),
    deps.db.entryEvent.count(),
    deps.db.circleLeaderboardSnapshot.count(),
  ]);
  return { users, circles, activeCircles, entries, events, snapshots };
}
