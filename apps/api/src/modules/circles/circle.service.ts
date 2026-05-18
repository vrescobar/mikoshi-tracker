import type { PrismaClient } from "../../generated/prisma/client";
import {
  findCircleMembershipByUserId,
  findCircleHabitShare,
  findHabitForCircle,
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
