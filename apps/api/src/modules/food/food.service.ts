import type {
  FoodDayMeal,
  FoodDayResponse,
  FoodMealAttachment,
  FoodMealProvenance,
  FoodRelogInput,
  FoodRelogResponse,
  FoodSearchResult,
} from "@mikoshi-tracker/contracts/food";

import type { PrismaClient } from "../../generated/prisma/client";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { createEntry } from "../entries/entry.service";
import { persistEvent } from "../events/event.service";
import { resolveHabitDay } from "../today/today-clock";
import { computeNutrition } from "../today/today.service";
import {
  listFoodDayAttachments,
  listFoodDayRows,
  type RawFoodSearchRow,
  searchFoodItemRows,
  searchFoodMealRows,
} from "./food.repository";

export const FOOD_MEAL_SLUG = "food_meal";

type FoodServiceDeps = { db: PrismaClient };

class FoodSourceEventNotFoundError extends Error {
  constructor() {
    super("source event not found");
    this.name = "FoodSourceEventNotFoundError";
  }
}

export { FoodSourceEventNotFoundError };

/**
 * Fuzzy search over a user's food vocabulary: saved items/recipes and the names
 * of meals they've logged before. Ranking (done here, not in SQL) favours exact
 * name matches, then prefix, then contains; saved items outrank past meals; ties
 * break by recency. The skill layers its own LLM disambiguation on top.
 */
export async function searchFoods(
  deps: FoodServiceDeps,
  params: { userId: string; q: string; limit?: number; sources?: string },
): Promise<FoodSearchResult[]> {
  const q = params.q.trim().toLowerCase();
  if (q.length === 0) return [];
  const limit = params.limit ?? 20;
  const like = `%${escapeLike(q)}%`;

  const sources = parseSources(params.sources);
  const [meals, items] = await Promise.all([
    sources.meals ? searchFoodMealRows(deps.db, { userId: params.userId, like, limit: limit * 2 }) : [],
    sources.items ? searchFoodItemRows(deps.db, { userId: params.userId, like, limit: limit * 2 }) : [],
  ]);

  const results = [
    ...items.map((row) => mapRow(row, "item")),
    ...meals.map((row) => mapRow(row, "meal")),
  ].filter((r): r is FoodSearchResult => r !== null);

  results.sort((a, b) => scoreResult(b, q) - scoreResult(a, q));
  return results.slice(0, limit);
}

/**
 * Re-log a previous meal or saved item as a new food_meal event today. Copies
 * the source macros (optionally scaled by portion), stamps provenance
 * `similar_to_event`, and links back via similarToEventId / fromFoodItemId so
 * the audit trail shows where the entry came from.
 */
export async function relogFood(
  deps: FoodServiceDeps,
  params: { userId: string; input: FoodRelogInput; source?: string; timestamp: Date | number | string },
): Promise<FoodRelogResponse> {
  const sourceEvent = await deps.db.entryEvent.findFirst({
    where: { id: params.input.sourceEventId, userId: params.userId },
    include: { entry: { include: { entryType: { select: { slug: true } } } } },
  });
  if (!sourceEvent) throw new FoodSourceEventNotFoundError();

  const sourcePayload = parseRecord(sourceEvent.payload);
  if (!sourcePayload) throw new FoodSourceEventNotFoundError();

  const sourceSlug = sourceEvent.entry.entryType.slug;
  const isItem = sourceSlug === "food_item";
  const scale = params.input.portionScale ?? 1;

  const name = typeof sourcePayload.name === "string" && sourcePayload.name.length > 0 ? sourcePayload.name : "Meal";
  const occurredAt = params.input.occurredAt ? new Date(params.input.occurredAt) : new Date(params.timestamp);
  const kcal = scaleNumber(sourcePayload.kcal, scale);

  const payload: Record<string, unknown> = {
    name,
    kcal,
    protein_g: scaleNumber(sourcePayload.protein_g, scale),
    carbs_g: scaleNumber(sourcePayload.carbs_g, scale),
    fat_g: scaleNumber(sourcePayload.fat_g, scale),
    source: "similar_to_event",
    confidence: clampConfidence(sourcePayload.confidence),
  };
  const fiber = scaleNullableNumber(sourcePayload.fiber_g, scale);
  if (fiber !== null) payload.fiber_g = fiber;
  if (params.input.mealSlot) payload.mealSlot = params.input.mealSlot;
  if (isItem) {
    payload.fromFoodItemId = sourceEvent.id;
  } else {
    payload.similarToEventId = sourceEvent.id;
  }

  const entryId = await ensureFoodMealEntry(deps, params.userId, params.timestamp);
  const detail = await persistEvent(deps, {
    entryId,
    userId: params.userId,
    occurredAt,
    payload,
    source: params.source ?? "WEB",
    note: null,
    attachmentIds: [],
  });

  return {
    eventId: detail.id,
    name,
    kcal,
    mealSlot: params.input.mealSlot ?? null,
  };
}

/**
 * Diet "Today" read-model: the day's meals enriched with provenance + photo
 * thumbnails, plus the shared nutrition roll-up. One round-trip for the
 * redesigned Today tab. `date` defaults to the user's wall-clock today.
 */
export async function getFoodDay(
  deps: FoodServiceDeps,
  params: { userId: string; date?: string; timestamp: Date | number | string; timeZone?: string | null },
): Promise<FoodDayResponse> {
  let dateKey = params.date;
  if (!dateKey) {
    const user = await deps.db.user.findUnique({
      where: { id: params.userId },
      select: { timezone: true },
    });
    const tz = normalizeUserTimeZone(params.timeZone ?? user?.timezone ?? null);
    // Food is an event-log type: wall-clock date (cutoffHour 0), so a 01:00
    // snack belongs to that calendar day rather than the previous one.
    dateKey = resolveHabitDay({ timestamp: params.timestamp, timeZone: tz, cutoffHour: 0 }).todayKey;
  }

  const [rows, nutrition] = await Promise.all([
    listFoodDayRows(deps.db, { userId: params.userId, dateKey }),
    computeNutrition(deps, params.userId, dateKey),
  ]);

  const attachments = await listFoodDayAttachments(deps.db, {
    userId: params.userId,
    eventIds: rows.map((r) => r.eventId),
  });
  const byEvent = new Map<string, FoodMealAttachment[]>();
  for (const a of attachments) {
    const list = byEvent.get(a.eventId) ?? [];
    list.push({ id: a.id, url: `/api/attachments/${a.id}/file`, width: a.width, height: a.height });
    byEvent.set(a.eventId, list);
  }

  const meals: FoodDayMeal[] = rows.map((r) => ({
    eventId: r.eventId,
    occurredAt: toIso(r.occurredAt),
    dateKey: r.dateKey,
    payload: (parseRecord(r.payload) ?? {}) as FoodDayMeal["payload"],
    source: normalizeProvenance(r.source),
    attachments: byEvent.get(r.eventId) ?? [],
  }));

  return { date: dateKey, meals, nutrition };
}

function normalizeProvenance(value: string | null): FoodMealProvenance | null {
  if (value === "WEB" || value === "AI" || value === "SYSTEM" || value === "CIRCLE") return value;
  return null;
}

async function ensureFoodMealEntry(
  deps: FoodServiceDeps,
  userId: string,
  timestamp: Date | number | string,
): Promise<string> {
  const existing = await deps.db.entry.findFirst({
    where: { userId, isActive: true, entryType: { slug: FOOD_MEAL_SLUG } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await createEntry(deps, {
    userId,
    input: { entryTypeSlug: FOOD_MEAL_SLUG, name: "Meals", config: {} },
    timestamp,
  });
  return created.id;
}

function parseSources(raw: string | undefined): { items: boolean; meals: boolean } {
  if (!raw) return { items: true, meals: true };
  const set = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (set.size === 0) return { items: true, meals: true };
  return { items: set.has("items"), meals: set.has("meals") };
}

function mapRow(row: RawFoodSearchRow, kind: "item" | "meal"): FoodSearchResult | null {
  if (typeof row.name !== "string" || row.name.length === 0) return null;
  return {
    kind,
    eventId: row.eventId,
    name: row.name,
    kcal: numberOr(row.kcal, 0),
    protein_g: numberOr(row.protein_g, 0),
    carbs_g: numberOr(row.carbs_g, 0),
    fat_g: numberOr(row.fat_g, 0),
    fiber_g: nullableNumber(row.fiber_g),
    defaultPortionG: nullableNumber(row.defaultPortionG),
    isRecipe: row.isRecipe === null ? null : Boolean(row.isRecipe),
    usageCount: Number(row.usageCount),
    lastUsedAt: toIso(row.lastUsedAt),
  };
}

function scoreResult(r: FoodSearchResult, q: string): number {
  const name = r.name.toLowerCase();
  let score = 0;
  if (name === q) score += 1000;
  else if (name.startsWith(q)) score += 600;
  else if (name.includes(q)) score += 300;
  if (r.kind === "item") score += 120; // saved items outrank ad-hoc past meals
  score += Math.min(r.usageCount, 20) * 2; // frequently-logged names float up
  score += recencyBoost(r.lastUsedAt);
  return score;
}

function recencyBoost(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const ageDays = (Date.now() - t) / 86_400_000;
  return Math.max(0, 60 - ageDays); // newer = small positive nudge
}

function escapeLike(value: string): string {
  // LIKE has no escape clause here; neutralize its wildcards so a user typing
  // "%"/"_" searches literally rather than matching everything.
  return value.replace(/[%_]/g, " ");
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function scaleNumber(value: unknown, scale: number): number {
  return Math.round(numberOr(value, 0) * scale * 100) / 100;
}

function scaleNullableNumber(value: unknown, scale: number): number | null {
  const n = nullableNumber(value);
  return n === null ? null : Math.round(n * scale * 100) / 100;
}

function clampConfidence(value: unknown): number {
  const n = nullableNumber(value);
  if (n === null) return 0.6;
  return Math.min(1, Math.max(0, n));
}

function toIso(value: number | string | Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  // SQLite may hand back an ISO string or a numeric-as-string; normalize both.
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && /^\d+$/.test(value.trim())) return new Date(asNumber).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}
