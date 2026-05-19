import type { PrismaClient } from "../../generated/prisma/client";
import { serializeContractHabitKind, serializeContractWeekday } from "../../shared/habit-contract-mappers";
import { addDays, compareDateKeys, resolveHabitDay } from "../today/today-clock";
import { findLatestCheckinMutation } from "../checkins/checkin.repository";
import {
  completeHabitForToday,
  setHabitTotalForToday,
  TodayActionUnavailableError,
  undoHabitForToday,
} from "../checkins/checkin.service";
import {
  createCircleToken,
  listCircleTokens,
  revokeCircleToken,
} from "../../auth/circle-token";
import {
  addCircleMemberRecord,
  createCircleHabitShareRecord,
  createCircleRecord,
  findCircleHabitShare,
  findCircleMembershipById,
  findCircleMembershipByUserId,
  findCircleRecord,
  findCircleTokenRecord,
  findHabitForCircle,
  findUserByEmail,
  getCircleLeaderboardData,
  listCircleHabitSharesByUser,
  listCircleMemberRecords,
  listCirclesByUserId,
  listSharedHabitsWithTodayState,
  removeCircleHabitShareRecord,
  removeCircleMemberRecord,
  updateCircleMemberRecord,
} from "./circle.repository";

export { TodayActionUnavailableError };

function serializeCircleRecord(circle: {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.ownerId,
    createdAt: circle.createdAt.toISOString(),
    updatedAt: circle.updatedAt.toISOString(),
  };
}

function serializeCircleMember(m: {
  id: string;
  userId: string;
  role: string;
  externalId: string | null;
  joinedAt: Date;
  user: { name: string };
}) {
  return {
    membershipId: m.id,
    userId: m.userId,
    displayName: m.user.name,
    role: m.role as "owner" | "member",
    externalId: m.externalId,
    joinedAt: m.joinedAt.toISOString(),
  };
}

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

export class CircleUserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "CircleUserNotFoundError";
  }
}

export class CircleMemberAlreadyExistsError extends Error {
  constructor() {
    super("User is already a member of this circle");
    this.name = "CircleMemberAlreadyExistsError";
  }
}

export class CircleHabitAlreadySharedError extends Error {
  constructor() {
    super("Habit is already shared in this circle");
    this.name = "CircleHabitAlreadySharedError";
  }
}

export class CircleTokenNotFoundError extends Error {
  constructor() {
    super("Circle token not found");
    this.name = "CircleTokenNotFoundError";
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
  return { members: members.map(serializeCircleMember) };
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
      externalId: membership.externalId,
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

type CircleWriteBaseParams = {
  circleId: string;
  userId: string;
  habitId: string;
  timestamp?: Date | number | string;
};

export async function circleCompleteHabit(
  { db }: CircleServiceDependencies,
  params: CircleWriteBaseParams,
) {
  await assertCircleHabitWritable({ db }, params);
  const result = await completeHabitForToday(
    { db },
    {
      userId: params.userId,
      habitId: params.habitId,
      source: "circle",
      timestamp: params.timestamp,
    },
  );
  return {
    habitId: params.habitId,
    userId: params.userId,
    completed: result.currentState.completed,
    currentValue: result.currentState.value,
  };
}

export async function circleSetHabitTotal(
  { db }: CircleServiceDependencies,
  params: CircleWriteBaseParams & { total: number },
) {
  await assertCircleHabitWritable({ db }, params);
  const result = await setHabitTotalForToday(
    { db },
    {
      userId: params.userId,
      habitId: params.habitId,
      source: "circle",
      total: params.total,
      timestamp: params.timestamp,
    },
  );
  return {
    habitId: params.habitId,
    userId: params.userId,
    completed: result.currentState.completed,
    currentValue: result.currentState.value,
  };
}

export async function circleUndoHabit(
  { db }: CircleServiceDependencies,
  params: CircleWriteBaseParams,
) {
  await assertCircleHabitWritable({ db }, params);

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

  const latestMutation = await findLatestCheckinMutation(db, {
    habitId: params.habitId,
    dateKey: day.todayKey,
  });

  if (latestMutation?.source !== "CIRCLE") {
    throw new CircleUndoNotCircleSourcedError();
  }

  const result = await undoHabitForToday(
    { db },
    {
      userId: params.userId,
      habitId: params.habitId,
      source: "circle",
      timestamp: params.timestamp,
    },
  );
  return {
    habitId: params.habitId,
    userId: params.userId,
    completed: result.currentState.completed,
    currentValue: result.currentState.value,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function assertCircleOwner(
  db: PrismaClient,
  circleId: string,
  userId: string,
): Promise<void> {
  const membership = await findCircleMembershipByUserId(db, { circleId, userId });
  if (membership?.role !== "owner") {
    throw new CircleForbiddenError("Only the circle owner can perform this action");
  }
}

// ─── Session-authenticated lifecycle service functions ────────────────────────

export async function createCircle(
  { db }: CircleServiceDependencies,
  params: { userId: string; name: string },
) {
  const circle = await createCircleRecord(db, { ownerId: params.userId, name: params.name });
  return { item: serializeCircleRecord(circle) };
}

export async function listUserCircles(
  { db }: CircleServiceDependencies,
  params: { userId: string },
) {
  const circles = await listCirclesByUserId(db, params.userId);
  return { items: circles.map(serializeCircleRecord) };
}

export async function addCircleMember(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; email: string; externalId?: string },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);

  const targetUser = await findUserByEmail(db, params.email);
  if (!targetUser) {
    throw new CircleUserNotFoundError();
  }

  const existing = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: targetUser.id,
  });
  if (existing) {
    throw new CircleMemberAlreadyExistsError();
  }

  const membership = await addCircleMemberRecord(db, {
    circleId: params.circleId,
    userId: targetUser.id,
    externalId: params.externalId ?? null,
  });
  return { membership: serializeCircleMember(membership) };
}

export async function updateCircleMember(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; membershipId: string; role?: string; externalId?: string | null },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);

  const existing = await findCircleMembershipById(db, {
    circleId: params.circleId,
    membershipId: params.membershipId,
  });
  if (!existing) {
    throw new CircleMemberNotFoundError();
  }
  if (existing.role === "owner" && params.role !== undefined && params.role !== "owner") {
    throw new CircleForbiddenError("Cannot change the role of the circle owner");
  }

  const updated = await updateCircleMemberRecord(db, {
    membershipId: params.membershipId,
    role: params.role,
    externalId: params.externalId,
  });
  return { membership: serializeCircleMember(updated) };
}

export async function removeCircleMember(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; membershipId: string },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);

  const existing = await findCircleMembershipById(db, {
    circleId: params.circleId,
    membershipId: params.membershipId,
  });
  if (!existing) {
    throw new CircleMemberNotFoundError();
  }
  if (existing.role === "owner") {
    throw new CircleForbiddenError("Cannot remove the circle owner");
  }

  await removeCircleMemberRecord(db, params.membershipId);
  return {};
}

export async function shareHabit(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; habitId: string },
) {
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.callerId,
  });
  if (!membership) {
    throw new CircleForbiddenError("You are not a member of this circle");
  }

  const habit = await findHabitForCircle(db, params.habitId);
  if (habit?.userId !== params.callerId) {
    throw new CircleHabitNotFoundError();
  }

  const existing = await findCircleHabitShare(db, {
    circleId: params.circleId,
    habitId: params.habitId,
  });
  if (existing) {
    throw new CircleHabitAlreadySharedError();
  }

  const share = await createCircleHabitShareRecord(db, {
    circleId: params.circleId,
    habitId: params.habitId,
  });
  return {
    habitId: params.habitId,
    circleId: params.circleId,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function unshareHabit(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; habitId: string },
) {
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.callerId,
  });
  if (!membership) {
    throw new CircleForbiddenError("You are not a member of this circle");
  }

  const habit = await findHabitForCircle(db, params.habitId);
  if (habit?.userId !== params.callerId) {
    throw new CircleHabitNotFoundError();
  }

  const share = await findCircleHabitShare(db, {
    circleId: params.circleId,
    habitId: params.habitId,
  });
  if (!share) {
    throw new CircleHabitNotSharedError();
  }

  await removeCircleHabitShareRecord(db, {
    circleId: params.circleId,
    habitId: params.habitId,
  });
  return {};
}

// ─── Owner-only circle token service functions ────────────────────────────────

export async function mintCircleToken(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; label?: string },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);
  const { token, tokenId, createdAt } = await createCircleToken(db, params.circleId, params.label);
  return {
    token,
    tokenId,
    label: params.label ?? null,
    createdAt: createdAt.toISOString(),
  };
}

export async function listCircleTokensForOwner(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);
  const records = await listCircleTokens(db, params.circleId);
  return {
    tokens: records.map((r) => ({
      tokenId: r.id,
      label: r.label,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export async function revokeCircleTokenForOwner(
  { db }: CircleServiceDependencies,
  params: { circleId: string; callerId: string; tokenId: string },
) {
  await assertCircleOwner(db, params.circleId, params.callerId);
  const existing = await findCircleTokenRecord(db, {
    circleId: params.circleId,
    tokenId: params.tokenId,
  });
  if (!existing) {
    throw new CircleTokenNotFoundError();
  }
  await revokeCircleToken(db, params.tokenId);
  return {};
}

export async function getCircleDetail(
  { db }: CircleServiceDependencies,
  params: { circleId: string; userId: string },
) {
  // Check membership first — returns 404 for both "not a member" and "circle not found"
  // (avoids leaking existence to non-members)
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.userId,
  });
  if (!membership) {
    throw new CircleNotFoundError();
  }

  const [circle, members, myShares] = await Promise.all([
    findCircleRecord(db, params.circleId),
    listCircleMemberRecords(db, params.circleId),
    listCircleHabitSharesByUser(db, { circleId: params.circleId, userId: params.userId }),
  ]);

  if (!circle) {
    throw new CircleNotFoundError();
  }

  return {
    circle: serializeCircleRecord(circle),
    members: members.map(serializeCircleMember),
    mySharedHabits: myShares.map((s) => ({
      habitId: s.habit.id,
      name: s.habit.name,
    })),
  };
}
