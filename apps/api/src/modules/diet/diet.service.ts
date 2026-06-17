import type { DietGoalInput, DietGoalRecord, DietPreferences } from "@mikoshi-tracker/contracts/diet";

import type { Db } from "../../db/client";
import { createEntry, updateEntry } from "../entries/entry.service";
import { persistEvent } from "../events/event.service";

export const DIET_GOAL_SLUG = "diet_goal";
export const DIET_PREFS_SLUG = "diet_prefs";

type DietServiceDeps = { sqlite: Db };

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
  const entry = deps.sqlite.get<{ id: string }>(
    `SELECT e."id" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE e."userId" = ? AND e."isActive" = 1 AND et."slug" = ? LIMIT 1`,
    [userId, DIET_GOAL_SLUG],
  );
  if (!entry) return null;

  const events = deps.sqlite.all<{ id: string; payload: string; updatedAt: string; latestMutationType: string | null }>(
    `SELECT ee."id", ee."payload", ee."updatedAt",
       (SELECT em."type" FROM "EventMutation" em WHERE em."eventId" = ee."id" ORDER BY em."createdAt" DESC, em."id" DESC LIMIT 1) AS "latestMutationType"
     FROM "EntryEvent" ee WHERE ee."entryId" = ? AND ee."userId" = ?
     ORDER BY ee."occurredAt" DESC, ee."createdAt" DESC`,
    [entry.id, userId],
  );

  for (const event of events) {
    // Skip soft-deleted revisions (latest mutation is a DELETE).
    if (event.latestMutationType === "DELETE") continue;
    const payload = parseRecord(event.payload);
    if (!payload || typeof payload.kcalTarget !== "number") continue;
    return {
      ...(payload as unknown as DietGoalRecord),
      eventId: event.id,
      updatedAt: new Date(event.updatedAt).toISOString(),
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
  const entry = deps.sqlite.get<{ config: string }>(
    `SELECT e."config" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE e."userId" = ? AND e."isActive" = 1 AND et."slug" = ? LIMIT 1`,
    [userId, DIET_PREFS_SLUG],
  );
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
  const existing = deps.sqlite.get<{ id: string }>(
    `SELECT e."id" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId"
     WHERE e."userId" = ? AND e."isActive" = 1 AND et."slug" = ? LIMIT 1`,
    [userId, slug],
  );
  if (existing) return existing.id;

  const created = await createEntry({ db: deps.sqlite }, {
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
  await persistEvent({ db: deps.sqlite }, {
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
  await updateEntry({ db: deps.sqlite }, { userId: params.userId, entryId, input: { config: params.input } });
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
