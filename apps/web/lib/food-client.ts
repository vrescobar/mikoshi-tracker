import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { AttachmentMetadata } from "@mikoshi-tracker/contracts/attachments";
import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import type { EntryEventDetail, EntryEventRecord, EventMutationRecord } from "@mikoshi-tracker/contracts/events";

import { createApiUrl } from "./api";

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return response.statusText;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message ?? text;
  } catch {
    return text;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const response = await fetch(createApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner" | "other";

export type FoodSource = "label" | "similar_to_event" | "web_lookup" | "vision_only" | "manual";

export type FoodPayload = {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  portion_g: number | null;
  mealSlot: MealSlot | null;
  source: FoodSource;
  confidence: number;
  similarToEventId: string | null;
  sources: string[] | null;
  notes: string | null;
};

export type FoodEventRecord = EntryEventRecord & { payload: FoodPayload };
export type FoodEventDetail = EntryEventDetail & {
  payload: FoodPayload;
  mutations: EventMutationRecord[];
  attachments: AttachmentMetadata[];
};

export function isFoodPayload(value: unknown): value is FoodPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === "string" && typeof v.kcal === "number";
}

export async function listFoodEvents(from: string, to: string) {
  const params = new URLSearchParams({
    entryTypeSlug: "food_meal",
    from,
    to,
    limit: "100",
  });
  const body = await requestJson<{ items: EntryEventRecord[]; cursor: string | null; hasMore: boolean }>(
    `/api/events?${params.toString()}`,
  );
  return body;
}

export async function getFoodEventDetail(eventId: string) {
  const body = await requestJson<{ item: FoodEventDetail }>(`/api/events/${encodeURIComponent(eventId)}`);
  return body.item;
}

export async function updateFoodEvent(eventId: string, payload: FoodPayload) {
  const body = await requestJson<{ item: FoodEventDetail }>(`/api/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({ payload }),
  });
  return body.item;
}

export async function deleteFoodEvent(eventId: string) {
  const body = await requestJson<{ eventId: string; mutationId: string }>(`/api/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
  return body;
}

export async function undoFoodEvent(eventId: string) {
  const body = await requestJson<{ item: FoodEventDetail }>(`/api/events/${encodeURIComponent(eventId)}/undo`, {
    method: "POST",
  });
  return body.item;
}

/**
 * Returns the first active food_meal Entry for the current user, creating one
 * if none exists yet. The created entry acts as the persistent "food log" that
 * events are appended to.
 */
export async function ensureFoodEntry(): Promise<EntryRecord> {
  const existing = await requestJson<{ items: EntryRecord[] }>("/api/entries?entryTypeSlug=food_meal&isActive=true");
  if (existing.items.length > 0) {
    return existing.items[0];
  }
  const today = new Date().toISOString().slice(0, 10);
  const created = await requestJson<{ item: EntryRecord }>("/api/entries", {
    method: "POST",
    body: JSON.stringify({
      entryTypeSlug: "food_meal",
      name: "Food",
      config: {},
      startDate: today,
    }),
  });
  return created.item;
}

export async function createFoodEvent(entryId: string, payload: FoodPayload, occurredAt?: string): Promise<EntryEventDetail> {
  const body = await requestJson<{ item: EntryEventDetail }>(
    `/api/entries/${encodeURIComponent(entryId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        occurredAt: occurredAt ?? new Date().toISOString(),
        payload,
        source: "WEB",
      }),
    },
  );
  return body.item;
}

export async function getFoodAggregations(from: string, to: string, groupBy: "day" | "week" | "month" = "day") {
  const params = new URLSearchParams({
    entryTypeSlug: "food_meal",
    from,
    to,
    groupBy,
    fields: "kcal,protein_g,carbs_g,fat_g,fiber_g",
    include: "missing_days,count",
  });
  const body = await requestJson<AggregationResponse>(`/api/aggregations?${params.toString()}`);
  return body;
}
