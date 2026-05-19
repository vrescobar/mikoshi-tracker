import type { PrismaClient } from "../../generated/prisma/client";

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
  return db.circleHabitShare.create({
    data: { circleId: params.circleId, habitId: params.habitId },
  });
}

export async function removeCircleHabitShareRecord(
  db: PrismaClient,
  params: { circleId: string; habitId: string },
) {
  return db.circleHabitShare.delete({
    where: {
      circleId_habitId: { circleId: params.circleId, habitId: params.habitId },
    },
  });
}

export async function listCircleHabitSharesByUser(
  db: PrismaClient,
  params: { circleId: string; userId: string },
) {
  return db.circleHabitShare.findMany({
    where: {
      circleId: params.circleId,
      habit: { userId: params.userId },
    },
    include: {
      habit: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listSharedHabitsForMember(
  db: PrismaClient,
  params: { circleId: string; userId: string },
) {
  return db.circleHabitShare.findMany({
    where: {
      circleId: params.circleId,
      habit: { userId: params.userId, isActive: true },
    },
    include: {
      habit: {
        include: {
          user: { select: { timezone: true } },
          weekdays: { orderBy: { day: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findCircleHabitShare(
  db: PrismaClient,
  params: { circleId: string; habitId: string },
) {
  return db.circleHabitShare.findUnique({
    where: {
      circleId_habitId: { circleId: params.circleId, habitId: params.habitId },
    },
  });
}

export async function findHabitForCircle(db: PrismaClient, habitId: string) {
  return db.habit.findUnique({
    where: { id: habitId },
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

  const shares = await db.circleHabitShare.findMany({
    where: {
      circleId: params.circleId,
      habit: { userId: { in: memberIds }, isActive: true },
    },
    include: {
      habit: {
        include: {
          dayStates: {
            where: { dateKey: { gte: params.rangeStart, lte: params.todayKey } },
          },
        },
      },
    },
  });

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
  return db.circleHabitShare.findMany({
    where: {
      circleId: params.circleId,
      habit: { userId: params.userId, isActive: true },
    },
    include: {
      habit: {
        include: {
          weekdays: { orderBy: { day: "asc" } },
          dayStates: {
            where: { dateKey: params.todayKey },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
