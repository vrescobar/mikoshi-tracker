import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { ApiAccessTokenResponse } from "@mikoshi-tracker/contracts/api";
import type { CircleDetailResponse, CircleRecord } from "@mikoshi-tracker/contracts/circles";
import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import type { EntryEventDetail, EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import type { HabitDetail, HabitListFilters, Weekday } from "@mikoshi-tracker/contracts/habits";
import type { OverviewStats } from "@mikoshi-tracker/contracts/stats";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";
import "server-only";

import { cookies } from "next/headers";

import { createServerApiUrl } from "./api";

type SessionPayload = {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
  };
  timezone?: string;
};

/**
 * Today's date key (YYYY-MM-DD) in the given IANA timezone. Pages use this so the
 * day they query matches the timezone the API uses to bucket EntryEvent.dateKey;
 * a naive `new Date().toISOString()` would use UTC and miss events near midnight.
 */
export function todayKeyInTimeZone(timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone && timeZone.length > 0 ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type RegistrationStatusPayload = {
  registrationEnabled: boolean;
  hasUsers: boolean;
};

type AdminRegistrationPayload = {
  registrationEnabled: boolean;
};

type HabitPayload = {
  id: string;
  userId: string;
  name: string;
  kind: "boolean" | "quantity";
  description: string | null;
  category: string | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  isActive: boolean;
  frequencyType: "daily" | "weekly_count" | "weekdays" | "monthly_count";
  frequencyCount: number | null;
  weekdays: Weekday[];
};

type TodaySummaryPayload = {
  summary: TodaySummary;
};

type HabitDetailPayload = {
  item: HabitDetail;
};

type OverviewStatsPayload = {
  overview: OverviewStats;
};

type ApiAccessTokenPayload = ApiAccessTokenResponse;

function buildHabitListPath(filters?: Partial<HabitListFilters>) {
  const params = new URLSearchParams();

  if (filters?.status) {
    params.set("status", filters.status);
  }

  if (filters?.query) {
    params.set("query", filters.query);
  }

  if (filters?.category) {
    params.set("category", filters.category);
  }

  if (filters?.kind) {
    params.set("kind", filters.kind);
  }

  const query = params.toString();
  return query.length > 0 ? `/api/habits?${query}` : "/api/habits";
}

export async function buildCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
}

export async function getSessionFromCookieHeader(cookieHeader: string): Promise<SessionPayload | null> {
  const response = await fetch(createServerApiUrl("/api/session"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to validate session");
  }

  return (await response.json()) as SessionPayload;
}

export async function getRegistrationStatusFromCookieHeader(cookieHeader: string): Promise<RegistrationStatusPayload> {
  const response = await fetch(createServerApiUrl("/api/auth/registration"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load registration status");
  }

  return (await response.json()) as RegistrationStatusPayload;
}

export async function getAdminRegistrationFromCookieHeader(
  cookieHeader: string,
): Promise<AdminRegistrationPayload | null> {
  const response = await fetch(createServerApiUrl("/api/admin/registration"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load admin registration settings");
  }

  return (await response.json()) as AdminRegistrationPayload;
}

export async function listHabitsFromCookieHeader(
  cookieHeader: string,
  filters?: Partial<HabitListFilters>,
): Promise<HabitPayload[]> {
  const response = await fetch(createServerApiUrl(buildHabitListPath(filters)), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Unable to load habits");
  }

  const body = (await response.json()) as { items: HabitPayload[] };
  return body.items;
}

export async function getTodaySummaryFromCookieHeader(cookieHeader: string): Promise<TodaySummary> {
  const response = await fetch(createServerApiUrl("/api/today"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load today summary");
  }

  const body = (await response.json()) as TodaySummaryPayload;
  return body.summary;
}

export async function getOverviewStatsFromCookieHeader(cookieHeader: string): Promise<OverviewStats> {
  const response = await fetch(createServerApiUrl("/api/stats/overview"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load overview stats");
  }

  const body = (await response.json()) as OverviewStatsPayload;
  return body.overview;
}

export async function getApiAccessTokenFromCookieHeader(cookieHeader: string): Promise<ApiAccessTokenResponse> {
  const response = await fetch(createServerApiUrl("/api/api-access/token"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load api access token");
  }

  return (await response.json()) as ApiAccessTokenPayload;
}

export async function getCircleDetailFromCookieHeader(
  cookieHeader: string,
  circleId: string,
): Promise<CircleDetailResponse | null> {
  const response = await fetch(createServerApiUrl(`/api/circles/${circleId}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 404 || response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load circle detail");
  }

  return (await response.json()) as CircleDetailResponse;
}

export async function listCirclesFromCookieHeader(cookieHeader: string): Promise<CircleRecord[]> {
  const response = await fetch(createServerApiUrl("/api/circles"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Unable to load circles");
  }

  const body = (await response.json()) as { items: CircleRecord[] };
  return body.items;
}

export async function listEntriesFromCookieHeader(
  cookieHeader: string,
  filters?: { entryTypeSlug?: string; isActive?: boolean; query?: string },
): Promise<EntryRecord[]> {
  const params = new URLSearchParams();
  if (filters?.entryTypeSlug) params.set("entryTypeSlug", filters.entryTypeSlug);
  if (filters?.isActive !== undefined) params.set("isActive", String(filters.isActive));
  if (filters?.query) params.set("query", filters.query);
  const qs = params.toString();
  const path = qs ? `/api/entries?${qs}` : "/api/entries";

  const response = await fetch(createServerApiUrl(path), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Unable to load entries");
  }

  const body = (await response.json()) as { items: EntryRecord[] };
  return body.items;
}

export type EntryTypeRecord = {
  id: string;
  slug: string;
  name: string;
  cadence: "recurring" | "ad-hoc";
  skillSlug: string | null;
  isBuiltIn: boolean;
};

export async function listEntryTypesFromCookieHeader(
  cookieHeader: string,
): Promise<EntryTypeRecord[]> {
  const response = await fetch(createServerApiUrl("/api/entry-types"), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) return [];

  if (!response.ok) {
    throw new Error("Unable to load entry types");
  }

  const body = (await response.json()) as { items: EntryTypeRecord[] };
  return body.items;
}

export async function getHabitDetailFromCookieHeader(
  cookieHeader: string,
  habitId: string,
): Promise<HabitDetail | null> {
  const response = await fetch(createServerApiUrl(`/api/habits/${habitId}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load habit detail");
  }

  const body = (await response.json()) as HabitDetailPayload;
  return body.item;
}

export async function listFoodEventsFromCookieHeader(
  cookieHeader: string,
  from: string,
  to: string,
): Promise<EntryEventRecord[]> {
  const params = new URLSearchParams({ entryTypeSlug: "food_meal", from, to, limit: "100" });
  const response = await fetch(createServerApiUrl(`/api/events?${params.toString()}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Unable to load food events");
  }

  const body = (await response.json()) as { items: EntryEventRecord[] };
  return body.items;
}

export async function getFoodEventDetailFromCookieHeader(
  cookieHeader: string,
  eventId: string,
): Promise<EntryEventDetail | null> {
  const response = await fetch(createServerApiUrl(`/api/events/${encodeURIComponent(eventId)}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 404 || response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load food event");
  }

  const body = (await response.json()) as { item: EntryEventDetail };
  return body.item;
}

/**
 * Phase 13 (G-FOOD-3): repeated-meal aggregation grouped by `payload.name`,
 * used by the "Repeats" panel on `/food`.
 */
export async function getRepeatedFoodMealsFromCookieHeader(
  cookieHeader: string,
  from: string,
  to: string,
  limit = 5,
): Promise<AggregationResponse | null> {
  const params = new URLSearchParams({
    entryTypeSlug: "food_meal",
    from,
    to,
    groupBy: "none",
    groupByPayload: "name",
    fields: "kcal",
    include: "count",
    limit: String(limit),
  });
  const response = await fetch(createServerApiUrl(`/api/aggregations?${params.toString()}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) return null;

  if (!response.ok) {
    throw new Error("Unable to load repeated meals");
  }

  return (await response.json()) as AggregationResponse;
}

export async function getFoodAggregationsFromCookieHeader(
  cookieHeader: string,
  from: string,
  to: string,
  groupBy: "day" | "week" | "month" = "day",
): Promise<AggregationResponse | null> {
  const params = new URLSearchParams({
    entryTypeSlug: "food_meal",
    from,
    to,
    groupBy,
    fields: "kcal,protein_g,carbs_g,fat_g,fiber_g",
    include: "missing_days,count",
  });
  const response = await fetch(createServerApiUrl(`/api/aggregations?${params.toString()}`), {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load food aggregations");
  }

  return (await response.json()) as AggregationResponse;
}
