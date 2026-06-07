import type { PrismaClient } from "../../generated/prisma/client";
import { serializeContractHabitKind, serializeContractWeekday } from "../../shared/habit-contract-mappers";
import { addDays, compareDateKeys, dateKeyToLocalNoonTimestamp, resolveHabitDay } from "../today/today-clock";
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

/**
 * Thrown when a backdated check-in targets a date in the future or older than
 * MAX_BACKDATE_DAYS (measured against the member's local "today"). Maps to 400.
 */
export class CircleBackdateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircleBackdateRangeError";
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

/**
 * Thrown when a check-in is attempted on a contest that is not accepting
 * writes: status is `closed`/`archived`, or "now" falls outside the
 * [contestStartAt, contestEndAt] window. Maps to 409 CIRCLE_CLOSED.
 */
export class CircleClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircleClosedError";
  }
}

export type CircleServiceDependencies = { db: PrismaClient };

/**
 * Contest-window gate: rejects writes when the circle is closed/archived or the
 * moment falls outside the configured window. A circle with status `active` and
 * no window (the legacy default) always passes. Pass `now` for determinism in
 * tests.
 */
export function assertCircleAcceptsCheckins(
  circle: { status: string; contestStartAt: Date | null; contestEndAt: Date | null },
  now: Date = new Date(),
): void {
  if (circle.status !== "active") {
    throw new CircleClosedError(`This contest is ${circle.status} and no longer accepts check-ins`);
  }
  if (circle.contestStartAt && now < circle.contestStartAt) {
    throw new CircleClosedError("This contest has not started yet");
  }
  if (circle.contestEndAt && now > circle.contestEndAt) {
    throw new CircleClosedError("This contest has ended");
  }
}

export async function assertCircleHabitWritable(
  { db }: CircleServiceDependencies,
  params: { circleId: string; userId: string; habitId: string },
): Promise<void> {
  // Rule 0: the contest must be open (status active + within window, if any).
  const circle = await findCircleRecord(db, params.circleId);
  if (!circle) {
    throw new CircleMemberNotFoundError();
  }
  assertCircleAcceptsCheckins(circle);

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

/**
 * How many completions in a rolling 7-day window count as 100% for one habit.
 * Mirrors the per-period `completionTarget` semantics in `stats.shared.ts`:
 *  - DAILY         → 7 (one per day)
 *  - WEEKDAYS      → number of scheduled weekdays (each falls once per 7-day window)
 *  - WEEKLY_COUNT  → its weekly count (e.g. 4x/week → 4)
 *  - MONTHLY_COUNT → the monthly count amortized to a week (ceil over ~4 weeks)
 * Always ≥ 1 so a misconfigured habit never divides by zero.
 */
function weeklyTargetForHabit(habit: {
  frequencyType: string;
  frequencyCount: number | null;
  weekdays: Array<{ day: string }>;
}): number {
  switch (habit.frequencyType) {
    case "WEEKDAYS":
      return Math.max(1, habit.weekdays.length);
    case "WEEKLY_COUNT":
      return Math.max(1, habit.frequencyCount ?? 1);
    case "MONTHLY_COUNT":
      return Math.max(1, Math.ceil((habit.frequencyCount ?? 1) / 4));
    case "DAILY":
    default:
      return 7;
  }
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

    // Weekly adherence is `done / each-habit's-own-weekly-target`, NOT `done / 7`.
    // A habit set to 4x/week with 3 check-ins is 3/4 = 75%, not 3/7 = 43%. We sum
    // each habit's target (DAILY→7, WEEKDAYS→#days, WEEKLY_COUNT→count, …) and cap
    // its numerator at its own target so one over-done habit can't paper over a
    // neglected one.
    let weeklyCompletedCount = 0;
    let weeklyTargetCount = 0;
    for (const share of userShares) {
      const target = weeklyTargetForHabit(share.habit);
      const doneThisWeek = share.habit.dayStates.filter(
        (state) =>
          state.completed &&
          compareDateKeys(state.dateKey, weekStart) >= 0 &&
          compareDateKeys(state.dateKey, todayKey) <= 0,
      ).length;
      weeklyTargetCount += target;
      weeklyCompletedCount += Math.min(doneThisWeek, target);
    }

    const weeklyCompletionRate =
      weeklyTargetCount > 0
        ? Number(Math.min(1, weeklyCompletedCount / weeklyTargetCount).toFixed(2))
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
      weeklyCompletedCount,
      weeklyTargetCount,
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

/** Max days a check-in may be backdated, measured from the member's local today. */
const MAX_BACKDATE_DAYS = 14;

type CircleWriteBaseParams = {
  circleId: string;
  userId: string;
  habitId: string;
  /** The request "now" (real clock or test header) used to anchor the backdate guard. */
  timestamp?: Date | number | string;
  /** Optional backdate target `YYYY-MM-DD`; when set, the check-in lands on that day. */
  date?: string;
};

/**
 * Validate a backdate `date` against the member's local today and return the
 * UTC instant (local noon) to feed the checkin service. Rejects future dates and
 * anything older than MAX_BACKDATE_DAYS.
 */
function resolveBackdateTimestamp(params: {
  date: string;
  timeZone: string;
  now: Date | number | string;
}): Date {
  const today = resolveHabitDay({ timestamp: params.now, timeZone: params.timeZone }).todayKey;
  const target = params.date;
  if (compareDateKeys(target, today) > 0) {
    throw new CircleBackdateRangeError(`No se puede registrar un check-in en una fecha futura (${target}).`);
  }
  const floor = addDays(today, -MAX_BACKDATE_DAYS);
  if (compareDateKeys(target, floor) < 0) {
    throw new CircleBackdateRangeError(
      `No se puede corregir más de ${MAX_BACKDATE_DAYS} días atrás (${target} es anterior a ${floor}).`,
    );
  }
  return dateKeyToLocalNoonTimestamp(target, params.timeZone);
}

/**
 * Resolve the timestamp a circle write should use. With no `date` it is the
 * request "now" (byte-identical to the old behavior). With a `date` it is the
 * member's local noon on that day, after the backdate guard.
 */
async function resolveEffectiveTimestamp(
  db: PrismaClient,
  params: CircleWriteBaseParams,
): Promise<Date | number | string | undefined> {
  if (!params.date) return params.timestamp;
  const user = await db.user.findUnique({ where: { id: params.userId }, select: { timezone: true } });
  if (!user) throw new CircleMemberNotFoundError();
  return resolveBackdateTimestamp({
    date: params.date,
    timeZone: user.timezone,
    now: params.timestamp ?? new Date(),
  });
}

export async function circleCompleteHabit(
  { db }: CircleServiceDependencies,
  params: CircleWriteBaseParams,
) {
  await assertCircleHabitWritable({ db }, params);
  const timestamp = await resolveEffectiveTimestamp(db, params);
  const result = await completeHabitForToday(
    { db },
    {
      userId: params.userId,
      habitId: params.habitId,
      source: "circle",
      onBehalfOfCircleId: params.circleId,
      timestamp,
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
  const timestamp = await resolveEffectiveTimestamp(db, params);
  const result = await setHabitTotalForToday(
    { db },
    {
      userId: params.userId,
      habitId: params.habitId,
      source: "circle",
      onBehalfOfCircleId: params.circleId,
      total: params.total,
      timestamp,
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

  const timestamp = params.date
    ? resolveBackdateTimestamp({
        date: params.date,
        timeZone: user.timezone,
        now: params.timestamp ?? new Date(),
      })
    : params.timestamp;

  const day = resolveHabitDay({
    timestamp: timestamp ?? new Date(),
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
      onBehalfOfCircleId: params.circleId,
      timestamp,
    },
  );
  return {
    habitId: params.habitId,
    userId: params.userId,
    completed: result.currentState.completed,
    currentValue: result.currentState.value,
  };
}

/**
 * Set a member's display name (global `User.name`). Circle-token authenticated:
 * the token can only rename users who are members of ITS circle (we verify the
 * membership first), so a circle token cannot touch arbitrary users. Owner-only
 * enforcement lives in the bridge/skill — consistent with check-in writes, which
 * the circle token already performs for any member.
 */
export async function setCircleMemberName(
  { db }: CircleServiceDependencies,
  params: { circleId: string; userId: string; name: string },
) {
  const membership = await findCircleMembershipByUserId(db, {
    circleId: params.circleId,
    userId: params.userId,
  });
  if (!membership) {
    throw new CircleMemberNotFoundError();
  }
  await db.user.update({ where: { id: params.userId }, data: { name: params.name } });
  const updated = await findCircleMembershipById(db, {
    circleId: params.circleId,
    membershipId: membership.id,
  });
  return { membership: serializeCircleMember(updated!) };
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
