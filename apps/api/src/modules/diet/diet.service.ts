import type { DietGoalInput, DietGoalRecord, DietPreferences } from "@mikoshi-tracker/contracts/diet";

import type { PrismaClient } from "../../generated/prisma/client";
import { createEntry, updateEntry } from "../entries/entry.service";
import { persistEvent } from "../events/event.service";

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

/**
 * Get-or-create the singleton Entry that backs a diet type for a user. Goals
 * and preferences each live on exactly one entry per user; revisions are events
 * (goal) or config edits (prefs) on that entry.
 */
async function ensureDietEntry(
  deps: DietServiceDeps,
  userId: string,
  slug: string,
  name: string,
  timestamp: Date | number | string,
): Promise<string> {
  const existing = await deps.db.entry.findFirst({
    where: { userId, isActive: true, entryType: { slug } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await createEntry(deps, {
    userId,
    input: { entryTypeSlug: slug, name, config: {} },
    timestamp,
  });
  return created.id;
}

/**
 * Record a new diet goal revision. Each call appends an event to the user's
 * diet_goal entry, so the engine keeps an immutable history of how their
 * targets changed. Returns the now-active goal.
 */
export async function setDietGoal(
  deps: DietServiceDeps,
  params: { userId: string; input: DietGoalInput; source?: string; timestamp: Date | number | string },
): Promise<DietGoalRecord> {
  const entryId = await ensureDietEntry(deps, params.userId, DIET_GOAL_SLUG, "Diet goal", params.timestamp);
  await persistEvent(deps, {
    entryId,
    userId: params.userId,
    occurredAt: new Date(params.timestamp),
    payload: params.input,
    source: params.source ?? "WEB",
    note: null,
    attachmentIds: [],
  });
  const goal = await resolveActiveDietGoal(deps, params.userId);
  if (!goal) throw new Error("diet goal was not persisted");
  return goal;
}

/**
 * Replace a user's dietary preferences on their diet_prefs Entry.config. Unlike
 * goals these are a current-state singleton (no per-change history needed), so
 * we edit config in place through the standard entry-update path (which
 * validates against the diet_prefs configSchema).
 */
export async function setDietPreferences(
  deps: DietServiceDeps,
  params: { userId: string; input: DietPreferences; timestamp: Date | number | string },
): Promise<DietPreferences> {
  const entryId = await ensureDietEntry(deps, params.userId, DIET_PREFS_SLUG, "Diet preferences", params.timestamp);
  await updateEntry(deps, { userId: params.userId, entryId, input: { config: params.input } });
  return getDietPreferences(deps, params.userId);
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
