import type { ErrorCode } from "@mikoshi-tracker/contracts/errors";

import { clearAdminKey, getAdminKey } from "./auth";

// The v1 envelope, imported in spirit from @mikoshi-tracker/contracts/envelope —
// the same shapes the API, MCP, and web app share (cross-frontend SSOT).
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

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = getAdminKey();
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch (cause) {
    throw new ApiError("NETWORK", cause instanceof Error ? cause.message : "Network error");
  }

  const payload = (await response.json()) as Envelope<T>;
  if (!payload.ok) {
    // A bad/expired key surfaces as 401 — drop it so the login gate reappears.
    if (response.status === 401) clearAdminKey();
    throw new ApiError(payload.code, payload.error);
  }
  return payload.data;
}

export type ListResult<T> = { items: T[]; total: number };

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

export type DashboardMetrics = {
  users: number;
  circles: number;
  activeCircles: number;
  entries: number;
  events: number;
  snapshots: number;
};

export const api = {
  dashboard: () => call<DashboardMetrics>("GET", "/admin/dashboard/metrics"),
  listCircles: (limit = 50, offset = 0) =>
    call<ListResult<AdminCircle>>("GET", `/admin/circles?limit=${limit}&offset=${offset}`),
  createSnapshot: (circleId: string) =>
    call<{ circleId: string; season: string; count: number }>("POST", "/admin/circles/snapshot/create", { circleId }),
};
