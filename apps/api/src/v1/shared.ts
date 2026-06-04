import type { PaginationQuery, Source } from "@mikoshi-tracker/contracts/envelope";

/**
 * Applies `{limit, offset}` to an already-materialized array and returns the
 * v1 list shape `{items, total}`. Used by adapters over services that return
 * "all rows" today (entries, circles, members, aggregations). `total` reflects
 * the full set, `items` the requested page.
 */
export function paginate<T>(all: T[], query: PaginationQuery | undefined): { items: T[]; total: number } {
  const total = all.length;
  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? total;
  return { items: all.slice(offset, offset + limit), total };
}

/**
 * v1 standardizes the check-in/event `source` as lowercase. The stored
 * `EventMutation.source` column and the legacy `/api` surface use UPPERCASE, so
 * adapters translate at the service boundary (no stored-data migration).
 */
const SOURCE_TO_LEGACY: Record<Source, "WEB" | "AI" | "SYSTEM" | "CIRCLE"> = {
  web: "WEB",
  ai: "AI",
  system: "SYSTEM",
  circle: "CIRCLE",
};

export function sourceToLegacy(source: Source): "WEB" | "AI" | "SYSTEM" | "CIRCLE" {
  return SOURCE_TO_LEGACY[source];
}

export function sourceFromLegacy(value: string): Source {
  return value.toLowerCase() as Source;
}
