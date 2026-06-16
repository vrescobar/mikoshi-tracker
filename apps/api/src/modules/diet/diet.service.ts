import type { DietGoalRecord, DietPreferences } from "@mikoshi-tracker/contracts/diet";

import type { PrismaClient } from "../../generated/prisma/client";

export const DIET_GOAL_SLUG = "diet_goal";
export const DIET_PREFS_SLUG = "diet_prefs";

type DietServiceDeps = { db: PrismaClient };

/**
 * Resolve a user's ACTIVE diet goal: the most recent non-deleted event on their
 * diet_goal entry. Goals are a history-aware event log, so "active" is simply
 * "latest" — there is no separate state to keep in sync. Returns null when the
 * user has never set a goal (the dashboard then shows no targets).
 */
export async function resolveActiveDietGoal(
  deps: DietServiceDeps,
  userId: string,
): Promise<DietGoalRecord | null> {
  const entry = await deps.db.entry.findFirst({
    where: { userId, isActive: true, entryType: { slug: DIET_GOAL_SLUG } },
    select: { id: true },
  });
  if (!entry) return null;

  const events = await deps.db.entryEvent.findMany({
    where: { entryId: entry.id, userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { mutations: { orderBy: { createdAt: "desc" }, take: 1, select: { type: true } } },
  });

  for (const event of events) {
    // Skip soft-deleted revisions (latest mutation is a DELETE).
    if (event.mutations[0]?.type === "DELETE") continue;
    const payload = parseRecord(event.payload);
    if (!payload || typeof payload.kcalTarget !== "number") continue;
    return {
      ...(payload as unknown as DietGoalRecord),
      eventId: event.id,
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  return null;
}

/**
 * Read a user's dietary preferences from their diet_prefs Entry.config. Returns
 * an empty preferences object when none is set, so callers never special-case
 * the missing-entry path.
 */
export async function getDietPreferences(
  deps: DietServiceDeps,
  userId: string,
): Promise<DietPreferences> {
  const entry = await deps.db.entry.findFirst({
    where: { userId, isActive: true, entryType: { slug: DIET_PREFS_SLUG } },
    select: { config: true },
  });
  if (!entry) return {};
  const config = parseRecord(entry.config);
  return (config as DietPreferences | null) ?? {};
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}
