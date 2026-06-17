import type { CreateHabitInput } from "@mikoshi-tracker/contracts/habits";

import type { PrismaClient } from "../../generated/prisma/client";
import type { Db } from "../../db/client";
import { findCircleMembershipByUserId, findUserByExternalId } from "../circles/circle.repository";
import { CircleHabitAlreadySharedError, CircleNotFoundError, shareHabit } from "../circles/circle.service";
import { createHabit } from "../habits/habit.service";

type Deps = { db: PrismaClient; sqlite: Db };

/**
 * Set up a contest in one call: create the same habit for every listed member
 * and share it into the circle. Idempotent and partial-failure tolerant — each
 * externalId lands in exactly one bucket. Mirrors the single assign-habit flow
 * (createHabit as the user, then shareHabit), reused across many members.
 */
export async function bulkAssignHabit(
  deps: Deps,
  params: { circleId: string; externalIds: string[]; habit: CreateHabitInput },
): Promise<{ assigned: string[]; notMember: string[]; notProvisioned: string[] }> {
  const circle = await deps.db.circle.findUnique({ where: { id: params.circleId }, select: { id: true } });
  if (!circle) throw new CircleNotFoundError();

  const assigned: string[] = [];
  const notMember: string[] = [];
  const notProvisioned: string[] = [];

  for (const externalId of [...new Set(params.externalIds)]) {
    const user = await findUserByExternalId(deps.db, externalId);
    if (!user) {
      notProvisioned.push(externalId);
      continue;
    }
    const membership = await findCircleMembershipByUserId(deps.db, { circleId: params.circleId, userId: user.id });
    if (!membership) {
      notMember.push(externalId);
      continue;
    }
    const habit = await createHabit({ db: deps.db, sqlite: deps.sqlite }, { userId: user.id, input: params.habit });
    try {
      await shareHabit({ db: deps.db }, { circleId: params.circleId, callerId: user.id, habitId: habit.id });
    } catch (error) {
      if (!(error instanceof CircleHabitAlreadySharedError)) throw error;
    }
    assigned.push(externalId);
  }

  return { assigned, notMember, notProvisioned };
}
