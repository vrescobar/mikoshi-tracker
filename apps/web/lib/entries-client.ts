import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

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
