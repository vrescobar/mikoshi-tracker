import type { PrismaClient } from "../../generated/prisma/client";

import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

// Habit sharing now lives on CircleEntryShare/Entry/EntryEvent. These functions keep
// their legacy names and `.habit` sub-shape (so circle.service is unchanged), but the
// `habitId` they receive is the Entry id — the {habitId} backward-compat alias is a
// pure pass-through because Entry.id == the old Habit.id.

const habitEntryInclude = {
  entryType: { select: { slug: true } },
  weekdays: true,
} as const;

type EntryEventRow = { dateKey: string; value: unknown; completed: boolean | null };

function mapEventsToDayStates(events: EntryEventRow[]) {
  return events.map((event) => ({
    dateKey: event.dateKey,
    value: event.value === null ? null : Number(event.value),
    completed: event.completed ?? false,
  }));
}

export async function createCircleRecord(db: PrismaClient, params: { ownerId: string; name: string }) {
  return db.circle.create({
    data: {
      name: params.name,
      ownerId: params.ownerId,
      memberships: {
        create: {
          userId: params.ownerId,
          role: "owner",
        },
      },
    },
  });
}

/**
 * Admin-side circle creation with contest-lifecycle fields. Like
 * `createCircleRecord` (owner becomes owner-member) but seeds status/season/
 * window. Used by `POST /api/admin/circles`.
 */
export async function createCircleWithLifecycle(
  db: PrismaClient,
  params: {
    ownerId: string;
    name: string;
    season?: string | null;
    contestStartAt?: Date | null;
    contestEndAt?: Date | null;
  },
) {
  return db.circle.create({
    data: {
      name: params.name,
      ownerId: params.ownerId,
      season: params.season ?? null,
      contestStartAt: params.contestStartAt ?? null,
      contestEndAt: params.contestEndAt ?? null,
      memberships: {
        create: { userId: params.ownerId, role: "owner" },
      },
    },
  });
}

/** Patch contest-lifecycle fields on a circle. Only provided keys are written. */
export async function updateCircleLifecycle(
  db: PrismaClient,
  circleId: string,
  patch: {
    status?: string;
    season?: string | null;
    contestStartAt?: Date | null;
    contestEndAt?: Date | null;
    leaderboardMode?: string;
  },
) {
  return db.circle.update({
    where: { id: circleId },
    data: {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.season !== undefined ? { season: patch.season } : {}),
      ...(patch.contestStartAt !== undefined ? { contestStartAt: patch.contestStartAt } : {}),
      ...(patch.contestEndAt !== undefined ? { contestEndAt: patch.contestEndAt } : {}),
      ...(patch.leaderboardMode !== undefined ? { leaderboardMode: patch.leaderboardMode } : {}),
    },
  });
}

/** Number of memberships in a circle (for admin circle detail). */
export async function countCircleMembers(db: PrismaClient, circleId: string) {
  return db.circleMembership.count({ where: { circleId } });
}

export async function listCirclesByUserId(db: PrismaClient, userId: string) {
  return db.circle.findMany({
    where: {
      memberships: { some: { userId } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findCircleRecord(db: PrismaClient, circleId: string) {
  return db.circle.findUnique({
    where: { id: circleId },
  });
}

export async function listCircleMemberRecords(db: PrismaClient, circleId: string) {
  return db.circleMembership.findMany({
    where: { circleId },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
}

export async function findCircleMembershipByUserId(
  db: PrismaClient,
  params: { circleId: string; userId: string },
) {
  return db.circleMembership.findUnique({
    where: {
      circleId_userId: { circleId: params.circleId, userId: params.userId },
    },
  });
}

export async function findCircleMembershipById(
  db: PrismaClient,
  params: { circleId: string; membershipId: string },
) {
  return db.circleMembership.findFirst({
    where: { id: params.membershipId, circleId: params.circleId },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export async function findUserByEmail(
  db: PrismaClient,
  email: string,
) {
  return db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
}

export async function findUserByExternalId(db: PrismaClient, externalId: string) {
  return db.user.findUnique({
    where: { externalId },
    select: { id: true },
  });
}

export async function addCircleMemberRecord(
  db: PrismaClient,
  params: { circleId: string; userId: string; externalId?: string | null },
) {
  return db.circleMembership.create({
    data: {
      circleId: params.circleId,
      userId: params.userId,
      role: "member",
      externalId: params.externalId ?? null,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export async function updateCircleMemberRecord(
  db: PrismaClient,
  params: { membershipId: string; role?: string; externalId?: string | null },
) {
  return db.circleMembership.update({
    where: { id: params.membershipId },
    data: {
      ...(params.role !== undefined ? { role: params.role } : {}),
      ...(params.externalId !== undefined ? { externalId: params.externalId } : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export async function removeCircleMemberRecord(db: PrismaClient, membershipId: string) {
  return db.circleMembership.delete({
    where: { id: membershipId },
  });
}

export async function createCircleHabitShareRecord(
  db: PrismaClient,
  params: { circleId: string; habitId: string },
) {
  return db.circleEntryShare.create({
    data: { circleId: params.circleId, entryId: params.habitId },
  });
}

export async function removeCircleHabitShareRecord(
  db: PrismaClient,
  params: { circleId: string; habitId: string },
) {
  return db.circleEntryShare.delete({
    where: {
      circleId_entryId: { circleId: params.circleId, entryId: params.habitId },
    },
  });
}

export async function listCircleHabitSharesByUser(
  db: PrismaClient,
  params: { circleId: string; userId: string },
) {
  const shares = await db.circleEntryShare.findMany({
    where: {
      circleId: params.circleId,
      entry: { userId: params.userId, entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } } },
    },
    include: {
      entry: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return shares.map((share) => ({ habit: { id: share.entry.id, name: share.entry.name } }));
}

/**
 * Map each given entry (habit) id to the circles it's shared into, with the
 * circle name. Batched in a single query; returns an empty map for empty input
 * (avoids an `IN ()`). Ownership is the caller's responsibility — pass only
 * entry ids the user already owns.
 */
export async function findCirclesForEntries(
  db: PrismaClient,
  entryIds: string[],
): Promise<Map<string, Array<{ circleId: string; name: string }>>> {
  const result = new Map<string, Array<{ circleId: string; name: string }>>();
  if (entryIds.length === 0) return result;

  const shares = await db.circleEntryShare.findMany({
    where: { entryId: { in: entryIds } },
    include: { circle: { select: { id: true, name: true } } },
  });

  for (const share of shares) {
    const list = result.get(share.entryId) ?? [];
    list.push({ circleId: share.circle.id, name: share.circle.name });
    result.set(share.entryId, list);
  }
  return result;
}

export async function findCircleHabitShare(
  db: PrismaClient,
  params: { circleId: string; habitId: string },
) {
  return db.circleEntryShare.findUnique({
    where: {
      circleId_entryId: { circleId: params.circleId, entryId: params.habitId },
    },
  });
}

export async function findHabitForCircle(db: PrismaClient, habitId: string) {
  return db.entry.findFirst({
    where: { id: habitId, entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } } },
    select: { id: true, userId: true, isActive: true },
  });
}

export async function getCircleLeaderboardData(
  db: PrismaClient,
  params: { circleId: string; rangeStart: string; todayKey: string },
) {
  const memberships = await db.circleMembership.findMany({
    where: { circleId: params.circleId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const memberIds = memberships.map((m) => m.userId);

  const shareRows = await db.circleEntryShare.findMany({
    where: {
      circleId: params.circleId,
      entry: {
        userId: { in: memberIds },
        isActive: true,
        entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } },
      },
    },
    include: {
      entry: {
        select: {
          userId: true,
          events: {
            where: { dateKey: { gte: params.rangeStart, lte: params.todayKey } },
          },
        },
      },
    },
  });

  const shares = shareRows.map((share) => ({
    habit: { userId: share.entry.userId, dayStates: mapEventsToDayStates(share.entry.events) },
  }));

  return { memberships, shares };
}

export async function findCircleTokenRecord(
  db: PrismaClient,
  params: { circleId: string; tokenId: string },
) {
  return db.circleToken.findFirst({
    where: { id: params.tokenId, circleId: params.circleId },
    select: { id: true, circleId: true, label: true, createdAt: true, updatedAt: true },
  });
}

export async function listSharedHabitsWithTodayState(
  db: PrismaClient,
  params: { circleId: string; userId: string; todayKey: string },
) {
  const shares = await db.circleEntryShare.findMany({
    where: {
      circleId: params.circleId,
      entry: { userId: params.userId, isActive: true, entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } } },
    },
    include: {
      entry: {
        include: {
          ...habitEntryInclude,
          events: { where: { dateKey: params.todayKey } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return shares.map((share) => ({
    habit: { ...mapEntryToHabit(share.entry), dayStates: mapEventsToDayStates(share.entry.events) },
  }));
}
