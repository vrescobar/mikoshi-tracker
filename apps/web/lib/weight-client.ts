import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import type { EntryEventDetail, EntryEventRecord } from "@mikoshi-tracker/contracts/events";

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

export type WeightPayload = {
  weight_kg: number;
  notes: string | null;
};

export type WeightEventRecord = EntryEventRecord & { payload: WeightPayload };

export function isWeightPayload(value: unknown): value is WeightPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.weight_kg === "number";
}

export async function ensureWeightEntry(): Promise<EntryRecord> {
  const existing = await requestJson<{ items: EntryRecord[] }>(
    "/api/entries?entryTypeSlug=weight_log&isActive=true",
  );
  if (existing.items.length > 0) {
    return existing.items[0];
  }
  const today = new Date().toISOString().slice(0, 10);
  const created = await requestJson<{ item: EntryRecord }>("/api/entries", {
    method: "POST",
    body: JSON.stringify({
      entryTypeSlug: "weight_log",
      name: "Daily weight",
      config: {},
      startDate: today,
    }),
  });
  return created.item;
}

export async function createWeightEvent(
  entryId: string,
  payload: WeightPayload,
  occurredAt?: string,
): Promise<EntryEventDetail> {
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

export async function listWeightEvents(from: string, to: string) {
  const params = new URLSearchParams({
    entryTypeSlug: "weight_log",
    from,
    to,
    limit: "100",
  });
  const body = await requestJson<{ items: EntryEventRecord[]; cursor: string | null; hasMore: boolean }>(
    `/api/events?${params.toString()}`,
  );
  return body;
}

export async function deleteWeightEvent(eventId: string) {
  const body = await requestJson<{ eventId: string; mutationId: string }>(
    `/api/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  return body;
}

export async function getWeightAggregations(
  from: string,
  to: string,
  groupBy: "day" | "week" | "month" = "day",
) {
  const params = new URLSearchParams({
    entryTypeSlug: "weight_log",
    from,
    to,
    groupBy,
    fields: "weight_kg",
    include: "missing_days",
  });
  const body = await requestJson<AggregationResponse>(`/api/aggregations?${params.toString()}`);
  return body;
}

/** The active weight_log entry, or null when none exists yet. */
export async function getWeightEntry(): Promise<EntryRecord | null> {
  const params = new URLSearchParams({ entryTypeSlug: "weight_log", isActive: "true" });
  const body = await requestJson<{ items: EntryRecord[] }>(`/api/entries?${params.toString()}`);
  return body.items[0] ?? null;
}
