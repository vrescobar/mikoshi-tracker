import type { PrismaClient } from "../../generated/prisma/client";

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

// Implemented in task 06
export async function assertCircleHabitWritable(
  _dependencies: CircleServiceDependencies,
  _params: { circleId: string; userId: string; habitId: string },
): Promise<void> {
  throw new Error("assertCircleHabitWritable: not yet implemented");
}
