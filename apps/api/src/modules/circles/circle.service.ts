import type { PrismaClient } from "../../generated/prisma/client";
import { serializeContractHabitKind, serializeContractWeekday } from "../../shared/habit-contract-mappers";
import { addDays, compareDateKeys, resolveHabitDay } from "../today/today-clock";
import {
  findCircleMembershipByUserId,
  findCircleHabitShare,
  findHabitForCircle,
  getCircleLeaderboardData,
  listCircleMemberRecords,
  listSharedHabitsWithTodayState,
} from "./circle.repository";

export class CircleNotFoundError extends Error {
  constructor() {
    super("Circle not found");
    this.name = "CircleNotFoundError";
  }
}

export class CircleForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "CircleForbiddenError";
  }
}

export class CircleMemberNotFoundError extends Error {
  constructor() {
    super("Member not in circle");
    this.name = "CircleMemberNotFoundError";
  }
}

export class CircleHabitNotFoundError extends Error {
  constructor() {
    super("Habit not found");
    this.name = "CircleHabitNotFoundError";
  }
}

export class CircleHabitNotSharedError extends Error {
  constructor() {
    super("Habit not shared in this circle");
    this.name = "CircleHabitNotSharedError";
  }
}

export class CircleHabitInactiveError extends Error {
  constructor() {
    super("Archived habits are read-only until restored");
    this.name = "CircleHabitInactiveError";
  }
}

export class CircleUndoNotCircleSourcedError extends Error {
  constructor() {
    super("Cannot undo: the day's latest mutation was not circle-sourced");
    this.name = "CircleUndoNotCircleSourcedError";
  }
}

export type CircleServiceDependencies = { db: PrismaClient };

export async function assertCircleHabitWritable(
  { db }: CircleServiceDependencies,
  params: { circleId: string; userId: string; habitId: string },
): Promise<void> {
  // Rule 1: userId must have a CircleMembership in circleId
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.userId,
  });
  if (!membership) {
    throw new CircleMemberNotFoundError();
  }

  // Rule 2: habitId must belong to userId; Rule 3: habit must be active
  const habit = await findHabitForCircle(db, params.habitId);
  if (habit?.userId !== params.userId) {
    throw new CircleHabitNotFoundError();
  }
  if (!habit.isActive) {
    throw new CircleHabitInactiveError();
  }

  // Rule 4: (circleId, habitId) must exist in CircleHabitShare
  const share = await findCircleHabitShare(db, {
    circleId: params.circleId,
    habitId: params.habitId,
  });
  if (!share) {
    throw new CircleHabitNotSharedError();
  }
}

export async function listCircleMembersForToken(
  { db }: CircleServiceDependencies,
  params: { circleId: string },
) {
  const members = await listCircleMemberRecords(db, params.circleId);
  return {
    members: members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      displayName: m.user.name,
      role: m.role as "owner" | "member",
      externalId: m.externalId,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

export async function getCircleLeaderboard(
  { db }: CircleServiceDependencies,
  params: { circleId: string; timestamp?: Date | number | string },
) {
  const now = params.timestamp ? new Date(params.timestamp) : new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const rangeStart = addDays(todayKey, -29);
  const weekStart = addDays(todayKey, -6);
  const yesterday = addDays(todayKey, -1);

  const { memberships, shares } = await getCircleLeaderboardData(db, {
    circleId: params.circleId,
    rangeStart,
    todayKey,
  });

  const sharesByUser = new Map<string, (typeof shares)[number][]>();
  for (const share of shares) {
    const userId = share.habit.userId;
    const existing = sharesByUser.get(userId) ?? [];
    existing.push(share);
    sharesByUser.set(userId, existing);
  }

  const leaderboard = memberships.map((membership) => {
    const userShares = sharesByUser.get(membership.userId) ?? [];

    const completedTodayCount = userShares.filter((share) =>
      share.habit.dayStates.some((state) => state.dateKey === todayKey && state.completed),
    ).length;

    const sharedHabitCount = userShares.length;

    const completedInWeek = userShares.reduce((sum, share) => {
      return (
        sum +
        share.habit.dayStates.filter(
          (state) =>
            state.completed &&
            compareDateKeys(state.dateKey, weekStart) >= 0 &&
            compareDateKeys(state.dateKey, todayKey) <= 0,
        ).length
      );
    }, 0);

    const weeklyCompletionRate =
      sharedHabitCount > 0
        ? Number(Math.min(1, completedInWeek / (sharedHabitCount * 7)).toFixed(2))
        : 0;

    let currentStreak = 0;
    if (sharedHabitCount > 0) {
      let cursor = yesterday;
      while (compareDateKeys(cursor, rangeStart) >= 0) {
        const hasCompletion = userShares.some((share) =>
          share.habit.dayStates.some((state) => state.dateKey === cursor && state.completed),
        );
        if (!hasCompletion) break;
        currentStreak++;
        cursor = addDays(cursor, -1);
      }
    }

    return {
      userId: membership.userId,
      displayName: membership.user.name,
      role: membership.role as "owner" | "member",
      completedTodayCount,
      sharedHabitCount,
      currentStreak,
      weeklyCompletionRate,
    };
  });

  leaderboard.sort((a, b) => {
    if (b.completedTodayCount !== a.completedTodayCount) return b.completedTodayCount - a.completedTodayCount;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.displayName.localeCompare(b.displayName);
  });

  return { leaderboard };
}

export async function getMemberHabitsForCircle(
  { db }: CircleServiceDependencies,
  params: { circleId: string; userId: string; timestamp?: Date | number | string },
) {
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.userId,
  });
  if (!membership) {
    throw new CircleMemberNotFoundError();
  }

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { timezone: true },
  });
  if (!user) {
    throw new CircleMemberNotFoundError();
  }

  const day = resolveHabitDay({
    timestamp: params.timestamp ?? new Date(),
    timeZone: user.timezone,
  });

  const shares = await listSharedHabitsWithTodayState(db, {
    circleId: params.circleId,
    userId: params.userId,
    todayKey: day.todayKey,
  });

  const habits = shares.map((share) => {
    const habit = share.habit;
    const todayState = habit.dayStates.at(0);

    let todayStatus: "pending" | "completed" | "not_due";
    if (compareDateKeys(day.todayKey, habit.startDate) < 0) {
      todayStatus = "not_due";
    } else if (habit.frequencyType === "WEEKDAYS") {
      const isDue = habit.weekdays.some((w) => serializeContractWeekday(w.day) === day.weekday);
      todayStatus = !isDue ? "not_due" : (todayState?.completed ? "completed" : "pending");
    } else {
      todayStatus = todayState?.completed ? "completed" : "pending";
    }

    return {
      habitId: habit.id,
      name: habit.name,
      kind: serializeContractHabitKind(habit.kind),
      todayStatus,
      todayValue: todayState?.value ?? null,
      targetValue: habit.targetValue,
      unit: habit.unit,
    };
  });

  return { habits };
}
