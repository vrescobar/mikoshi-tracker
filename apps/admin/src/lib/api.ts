import type { ErrorCode } from "@mikoshi-tracker/contracts/errors";

import { clearAdminKey, getAdminKey } from "./auth";
import { ACT_AS_HEADER } from "./constants";

// The v1 envelope, shared with the API/MCP/web app (cross-frontend SSOT).
type Envelope<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; error: string };

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | "NETWORK",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH";

interface CallOptions {
  body?: unknown;
  /** Run a v1 bearer route as this user via the impersonation header (god mode). */
  actAsUserId?: string;
  /** Base prefix. Defaults to the v1 surface; legacy admin routes use "/api". */
  base?: "/api/v1" | "/api";
}

async function call<T>(method: Method, path: string, opts: CallOptions = {}): Promise<T> {
  const key = getAdminKey();
  const base = opts.base ?? "/api/v1";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  if (opts.actAsUserId) headers[ACT_AS_HEADER] = opts.actAsUserId;

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    });
  } catch (cause) {
    throw new ApiError("NETWORK", cause instanceof Error ? cause.message : "Network error");
  }

  // Legacy /api routes don't always use the envelope; normalize both shapes.
  const raw = (await response.json().catch(() => null)) as unknown;
  if (raw && typeof raw === "object" && "ok" in raw) {
    const payload = raw as Envelope<T>;
    if (!payload.ok) {
      if (response.status === 401) clearAdminKey();
      throw new ApiError(payload.code, payload.error);
    }
    return payload.data;
  }

  // Legacy shape: success body is the data; error body is { code, message }.
  if (!response.ok) {
    if (response.status === 401) clearAdminKey();
    const err = raw as { code?: ErrorCode; message?: string } | null;
    throw new ApiError(err?.code ?? "INTERNAL_ERROR", err?.message ?? `Request failed (${response.status})`);
  }
  return raw as T;
}

// ── Shared types ────────────────────────────────────────────────────────────

export type ListResult<T> = { items: T[]; total: number };

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  externalId: string | null;
  isAdmin: boolean;
  timezone: string;
  createdAt: string;
};

export type AdminCircle = {
  id: string;
  name: string;
  ownerId: string;
  status: "active" | "closed" | "archived";
  season: string | null;
  contestStartAt: string | null;
  contestEndAt: string | null;
  leaderboardMode: "rolling" | "snapshot";
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminEntry = {
  id: string;
  userId: string;
  entryTypeSlug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type AdminEvent = {
  id: string;
  entryId: string;
  userId: string;
  occurredAt: string;
  dateKey: string;
  completed: boolean | null;
};

export type DashboardMetrics = {
  users: number;
  circles: number;
  activeCircles: number;
  entries: number;
  events: number;
  snapshots: number;
};

export type AuditEntry = {
  id: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type AdminTokenMeta = {
  tokenId: string;
  label: string;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type EntryRecord = {
  id: string;
  userId: string;
  entryTypeId: string;
  entryTypeSlug: string;
  name: string;
  description: string | null;
  category: string | null;
  config: unknown;
  startDate: string | null;
  isActive: boolean;
  weekdays?: string[];
  createdAt: string;
  updatedAt: string;
};

export type EntryTypeRecord = {
  id: string;
  slug: string;
  displayName: string;
  cadence: "recurring" | "event_log";
  isBuiltIn: boolean;
  isActive: boolean;
};

export type EventMutationRecord = {
  id: string;
  type: string;
  source: string;
  note: string | null;
  dateKey: string;
  previousPayload: unknown;
  nextPayload: unknown;
  onBehalfOfCircleId: string | null;
  createdAt: string;
};

export type EventDetail = {
  id: string;
  entryId: string;
  userId: string;
  occurredAt: string;
  dateKey: string;
  payload: unknown;
  value: number | null;
  completed: boolean | null;
  createdAt: string;
  updatedAt: string;
  mutations?: EventMutationRecord[];
};

export type CircleMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  role: "owner" | "member";
  externalId: string | null;
  joinedAt: string;
};

export type SharedHabitSummary = {
  habitId: string;
  name: string;
};

export type CircleDetail = {
  circle: { id: string; name: string; ownerId: string; createdAt: string; updatedAt: string };
  members: CircleMember[];
  mySharedHabits: SharedHabitSummary[];
};

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  role: string;
  externalId: string | null;
  completedTodayCount: number;
  sharedHabitCount: number;
  currentStreak: number;
  weeklyCompletionRate: number;
  weeklyCompletedCount: number;
  weeklyTargetCount: number;
};

export type MetricLeaderboardEntry = {
  userId: string;
  displayName: string;
  role: string;
  externalId: string | null;
  rank: number;
  score: number;
  mode: string;
};

export type LeaderboardSnapshot = {
  id: string;
  circleId: string;
  season: string;
  userId: string;
  rank: number;
  score: number;
  data: unknown;
  createdAt: string;
};

export type SnapshotCompareRow = {
  userId: string;
  rankA: number | null;
  rankB: number | null;
  rankDelta: number | null;
  scoreA: number | null;
  scoreB: number | null;
  scoreDelta: number | null;
};

export type TodayItem = {
  habitId: string;
  name: string;
  kind: "boolean" | "quantity";
  status: "pending" | "available" | "completed";
  canUndo: boolean;
  progress?: { currentValue: number | null; targetValue: number | null; unit: string | null };
};

export type TodayNutrition = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  mealCount: number;
  kcalTarget: number | null;
};

export type TodaySummary = {
  date: string;
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  completionRate: number;
  pendingItems: TodayItem[];
  completedItems: TodayItem[];
  /** Diet roll-up for the day; null for users who don't log food. */
  nutrition?: TodayNutrition | null;
};

// ── Aggregations (diet/kcal page contract) ────────────────────────────────────

export type AggregationGroupBy = "day" | "week" | "month" | "none";

export type AggregationBucket = {
  key:
    | { kind: "date"; value: string }
    | { kind: "payload"; field: string; value: string; sample?: unknown };
  sum: Record<string, number>;
  count: number;
  missing: boolean;
};

export type AggregationResponse = {
  buckets: AggregationBucket[];
  total: { sum: Record<string, number>; count: number };
  weeklyAverage: { sum: Record<string, number>; count: number } | null;
};

export type AggregationQuery = {
  entryTypeSlug: string;
  entryId?: string;
  from: string;
  to: string;
  groupBy?: AggregationGroupBy;
  fields?: string;
  include?: string;
  groupByPayload?: string;
  limit?: number;
};

export type CircleContestConfig = {
  contestKind: "habit" | "metric";
  metricEntryTypeSlug?: string;
  metricField?: string;
  metricMode?: "cumulative" | "adherence" | "delta";
  metricTarget?: number;
  metricGoal?: "higher" | "lower";
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// ── Admin-key endpoints (god-mode reads + admin mutations) ────────────────────

export const adminApi = {
  dashboard: () => call<DashboardMetrics>("GET", "/admin/dashboard/metrics"),

  listUsers: (p: { q?: string; limit?: number; offset?: number } = {}) =>
    call<ListResult<AdminUser>>("GET", `/admin/users${qs({ q: p.q, limit: p.limit ?? 50, offset: p.offset ?? 0 })}`),

  listCircles: (p: { q?: string; limit?: number; offset?: number } = {}) =>
    call<ListResult<AdminCircle>>("GET", `/admin/circles${qs({ q: p.q, limit: p.limit ?? 100, offset: p.offset ?? 0 })}`),

  listEntries: (p: { userId?: string; entryTypeSlug?: string; q?: string; limit?: number; offset?: number } = {}) =>
    call<ListResult<AdminEntry>>(
      "GET",
      `/admin/entries${qs({ userId: p.userId, entryTypeSlug: p.entryTypeSlug, q: p.q, limit: p.limit ?? 100, offset: p.offset ?? 0 })}`,
    ),

  listEvents: (p: { userId?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) =>
    call<ListResult<AdminEvent>>(
      "GET",
      `/admin/events${qs({ userId: p.userId, from: p.from, to: p.to, limit: p.limit ?? 100, offset: p.offset ?? 0 })}`,
    ),

  auditLog: (p: { action?: string; limit?: number; offset?: number } = {}) =>
    call<ListResult<AuditEntry>>(
      "GET",
      `/admin/audit-log${qs({ action: p.action, limit: p.limit ?? 100, offset: p.offset ?? 0 })}`,
    ),

  userTokenMeta: (userId: string) =>
    call<{ userId: string; hasToken: boolean; createdAt: string | null; updatedAt: string | null }>(
      "GET",
      `/admin/users/token${qs({ userId })}`,
    ),
  ensureUserToken: (userId: string) =>
    call<{ userId: string; created: boolean; hasToken: boolean; token: string | null; updatedAt: string }>(
      "POST",
      "/admin/users/token/ensure",
      { body: { userId } },
    ),

  listTokens: () => call<{ tokens: AdminTokenMeta[] }>("GET", "/admin/tokens"),
  mintToken: (label: string) =>
    call<{ token: string; tokenId: string; label: string; createdAt: string }>("POST", "/admin/tokens/mint", {
      body: { label },
    }),
  revokeToken: (tokenId: string) => call<{ revoked: boolean }>("POST", "/admin/tokens/revoke", { body: { tokenId } }),

  // Snapshots
  createSnapshot: (circleId: string, season?: string) =>
    call<{ circleId: string; season: string; count: number }>("POST", "/admin/circles/snapshot/create", {
      body: { circleId, season },
    }),
  listSnapshots: (circleId: string, season?: string) =>
    call<ListResult<LeaderboardSnapshot>>("GET", `/admin/circles/snapshot/list${qs({ circleId, season })}`),
  compareSnapshots: (circleId: string, seasonA: string, seasonB: string) =>
    call<{ circleId: string; seasonA: string; seasonB: string; rows: SnapshotCompareRow[] }>(
      "GET",
      `/admin/circles/snapshot/compare${qs({ circleId, seasonA, seasonB })}`,
    ),

  // ── Legacy /api/admin lifecycle + identity (admin-key) ──
  getCircle: (circleId: string) =>
    call<{ circle: AdminCircle }>("GET", `/admin/circles/${encodeURIComponent(circleId)}`, { base: "/api" }),
  updateCircle: (
    circleId: string,
    patch: Partial<{
      status: "active" | "closed" | "archived";
      season: string | null;
      contestStartAt: string | null;
      contestEndAt: string | null;
      leaderboardMode: "rolling" | "snapshot";
    }>,
  ) =>
    call<{ circle: AdminCircle }>("PATCH", `/admin/circles/${encodeURIComponent(circleId)}`, {
      base: "/api",
      body: patch,
    }),
  createCircle: (body: {
    ownerExternalId: string;
    name: string;
    season?: string;
    contestStartAt?: string;
    contestEndAt?: string;
  }) => call<{ circle: AdminCircle; circleToken: string }>("POST", "/admin/circles", { base: "/api", body }),
  provisionUser: (body: { externalId: string; name?: string; timezone?: string }) =>
    call<{ userId: string; alreadyExists: boolean; personalToken?: string }>("POST", "/admin/provision-user", {
      base: "/api",
      body,
    }),
  enrollMember: (circleId: string, externalId: string) =>
    call<{ membershipId: string; userId: string; externalId: string }>(
      "POST",
      `/admin/circles/${encodeURIComponent(circleId)}/members`,
      { base: "/api", body: { externalId } },
    ),
  bulkEnroll: (circleId: string, externalIds: string[]) =>
    call<{ added: string[]; alreadyMembers: string[]; notProvisioned: string[] }>(
      "POST",
      `/admin/circles/${encodeURIComponent(circleId)}/members/bulk`,
      { base: "/api", body: { externalIds } },
    ),
  mergeUsers: (sourceUserId: string, targetUserId: string) =>
    call<{ targetUserId: string }>("POST", "/admin/users/merge", { base: "/api", body: { sourceUserId, targetUserId } }),
  attachExternalId: (userId: string, externalId: string, force?: boolean) =>
    call<{ userId: string; externalId: string; previousExternalId: string | null }>(
      "POST",
      "/admin/users/attach-external-id",
      { base: "/api", body: { userId, externalId, force } },
    ),
  loginAs: (userId: string, next?: string) =>
    call<{ url: string; userId: string; expiresAt: string }>("POST", "/admin/login-as", {
      base: "/api",
      body: { userId, next },
    }),
};

// ── User-scoped endpoints via impersonation (god-mode write) ──────────────────

export function asUser(userId: string) {
  const act = { actAsUserId: userId } as const;
  return {
    // entries
    listEntries: (p: { entryTypeSlug?: string; isActive?: boolean } = {}) =>
      call<ListResult<EntryRecord>>(
        "GET",
        `/entries${qs({ entryTypeSlug: p.entryTypeSlug, isActive: p.isActive, limit: 200 })}`,
        act,
      ),
    getEntry: (entryId: string) => call<EntryRecord>("GET", `/entries/${encodeURIComponent(entryId)}`, act),
    createEntry: (body: unknown) => call<EntryRecord>("POST", "/entries/create", { ...act, body }),
    updateEntry: (body: unknown) => call<EntryRecord>("POST", "/entries/update", { ...act, body }),
    archiveEntry: (entryId: string) => call<EntryRecord>("POST", "/entries/archive", { ...act, body: { entryId } }),
    restoreEntry: (entryId: string) => call<EntryRecord>("POST", "/entries/restore", { ...act, body: { entryId } }),
    listEntryTypes: () => call<ListResult<EntryTypeRecord>>("GET", `/entry-types${qs({ limit: 200 })}`, act),

    // events
    listEvents: (p: { entryId?: string; from?: string; to?: string; limit?: number } = {}) =>
      call<{ items: EventDetail[]; cursor: string | null; hasMore: boolean }>(
        "GET",
        `/events${qs({ entryId: p.entryId, from: p.from, to: p.to, limit: p.limit ?? 100 })}`,
        act,
      ),
    getEvent: (eventId: string) => call<EventDetail>("GET", `/events/${encodeURIComponent(eventId)}`, act),
    createEvent: (body: { entryId: string; occurredAt: string; payload: unknown; note?: string | null }) =>
      call<EventDetail>("POST", "/events/create", { ...act, body }),
    updateEvent: (body: { eventId: string; payload?: unknown; note?: string | null }) =>
      call<EventDetail>("POST", "/events/update", { ...act, body }),
    deleteEvent: (eventId: string) => call<unknown>("POST", "/events/delete", { ...act, body: { eventId } }),
    undoEvent: (eventId: string) => call<EventDetail>("POST", "/events/undo", { ...act, body: { eventId } }),

    // check-ins (mark a habit for the user)
    complete: (habitId: string, note?: string | null) =>
      call<unknown>("POST", "/checkins/complete", { ...act, body: { habitId, source: "system", note } }),
    setTotal: (habitId: string, total: number, note?: string | null) =>
      call<unknown>("POST", "/checkins/set-total", { ...act, body: { habitId, total, source: "system", note } }),
    undoCheckin: (habitId: string, note?: string | null) =>
      call<unknown>("POST", "/checkins/undo", { ...act, body: { habitId, source: "system", note } }),

    // today + stats
    today: () => call<{ summary: TodaySummary }>("GET", "/today/summary", act),

    // aggregations (powers the diet/kcal exploration)
    aggregations: (p: AggregationQuery) =>
      call<AggregationResponse>(
        "GET",
        `/aggregations${qs({
          entryTypeSlug: p.entryTypeSlug,
          entryId: p.entryId,
          from: p.from,
          to: p.to,
          groupBy: p.groupBy ?? "day",
          fields: p.fields,
          include: p.include,
          groupByPayload: p.groupByPayload,
          limit: p.limit,
        })}`,
        act,
      ),

    // circles (owner-scoped operations run as the circle owner)
    listCircles: () =>
      call<ListResult<{ id: string; name: string; ownerId: string; createdAt: string; updatedAt: string }>>(
        "GET",
        `/circles${qs({ limit: 200 })}`,
        act,
      ),
    getCircle: (circleId: string) => call<CircleDetail>("GET", `/circles/${encodeURIComponent(circleId)}`, act),
    addMember: (circleId: string, email: string, externalId?: string) =>
      call<{ membership: CircleMember }>("POST", "/circles/members/add", {
        ...act,
        body: { circleId, email, externalId },
      }),
    removeMember: (circleId: string, membershipId: string) =>
      call<unknown>("POST", "/circles/members/remove", { ...act, body: { circleId, membershipId } }),
    updateMember: (circleId: string, membershipId: string, patch: { role?: "owner" | "member"; externalId?: string | null }) =>
      call<{ membership: CircleMember }>("POST", "/circles/members/update", {
        ...act,
        body: { circleId, membershipId, ...patch },
      }),
    configureContest: (circleId: string, config: CircleContestConfig) =>
      call<unknown>("POST", "/circles/contest/configure", { ...act, body: { circleId, ...config } }),
    shareHabit: (circleId: string, habitId: string) =>
      call<unknown>("POST", "/circles/share", { ...act, body: { circleId, habitId } }),
    unshareHabit: (circleId: string, habitId: string) =>
      call<unknown>("POST", "/circles/unshare", { ...act, body: { circleId, habitId } }),
  };
}

// circle-token-scoped reads (rolling + metric leaderboards) need a circle token,
// which the admin panel does not hold; standings are surfaced via snapshots and
// the per-circle owner view instead.

export const api = { admin: adminApi, asUser };
