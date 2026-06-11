import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

import { requestJson } from "./http";

export type EntryTypeRecord = {
  id: string;
  slug: string;
  displayName: string;
  cadence: string;
  skillSlug: string | null;
  isBuiltIn: boolean;
};

export async function listEntryTypes(): Promise<EntryTypeRecord[]> {
  const body = await requestJson<{ items: EntryTypeRecord[] }>("/api/entry-types");
  return body.items;
}

export async function listEntries(filters?: { entryTypeSlug?: string; isActive?: boolean; query?: string }) {
  const params = new URLSearchParams();
  if (filters?.entryTypeSlug) params.set("entryTypeSlug", filters.entryTypeSlug);
  if (filters?.isActive !== undefined) params.set("isActive", String(filters.isActive));
  if (filters?.query) params.set("query", filters.query);
  const qs = params.toString();
  const body = await requestJson<{ items: EntryRecord[] }>(qs ? `/api/entries?${qs}` : "/api/entries");
  return body.items;
}

export async function archiveEntry(id: string) {
  const body = await requestJson<{ item: EntryRecord }>(`/api/entries/${encodeURIComponent(id)}/archive`, {
    method: "POST",
  });
  return body.item;
}

export async function restoreEntry(id: string) {
  const body = await requestJson<{ item: EntryRecord }>(`/api/entries/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  return body.item;
}

/**
 * Patch a subset of the Entry's mutable fields. Used by the dashboard's
 * inline kcal-target editor (Phase 13 G-DASH-3).
 */
export async function updateEntry(
  id: string,
  patch: { name?: string; description?: string | null; config?: Record<string, unknown> },
) {
  const body = await requestJson<{ item: EntryRecord }>(
    `/api/entries/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return body.item;
}
