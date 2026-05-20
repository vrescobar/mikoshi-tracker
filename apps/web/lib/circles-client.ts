import type {
  AddCircleMemberInput,
  CircleDetailResponse,
  CircleItemResponse,
  CircleLeaderboardResponse,
  CircleListResponse,
  CircleMemberHabitsResponse,
  CircleMembershipResponse,
  CircleTokenCreatedResponse,
  CircleTokenListResponse,
  CreateCircleInput,
  CreateCircleTokenInput,
  ShareHabitInput,
  UpdateCircleMemberInput,
} from "@haaabit/contracts/circles";

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

async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(createApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

// ─── Session-authenticated: circle lifecycle ──────────────────────────────────

export async function createCircle(input: CreateCircleInput) {
  const body = await requestJson<CircleItemResponse>("/api/circles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.item;
}

export async function listCircles() {
  const body = await requestJson<CircleListResponse>("/api/circles", {
    method: "GET",
  });
  return body.items;
}

export async function getCircleDetail(circleId: string) {
  return requestJson<CircleDetailResponse>(`/api/circles/${circleId}`, {
    method: "GET",
  });
}

// ─── Session-authenticated: member management (owner only) ───────────────────

export async function addCircleMember(circleId: string, input: AddCircleMemberInput) {
  const body = await requestJson<CircleMembershipResponse>(`/api/circles/${circleId}/members`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.membership;
}

export async function updateCircleMember(circleId: string, membershipId: string, input: UpdateCircleMemberInput) {
  const body = await requestJson<CircleMembershipResponse>(
    `/api/circles/${circleId}/members/${membershipId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return body.membership;
}

export async function removeCircleMember(circleId: string, membershipId: string) {
  return requestNoContent(`/api/circles/${circleId}/members/${membershipId}`, {
    method: "DELETE",
  });
}

// ─── Session-authenticated: habit shares (member) ─────────────────────────────

export async function shareHabit(circleId: string, input: ShareHabitInput) {
  return requestNoContent(`/api/circles/${circleId}/shares`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function unshareHabit(circleId: string, habitId: string) {
  return requestNoContent(`/api/circles/${circleId}/shares/${habitId}`, {
    method: "DELETE",
  });
}

// ─── Session-authenticated: circle tokens (owner only) ───────────────────────

export async function mintCircleToken(circleId: string, input: CreateCircleTokenInput) {
  return requestJson<CircleTokenCreatedResponse>(`/api/circles/${circleId}/tokens`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listCircleTokens(circleId: string) {
  const body = await requestJson<CircleTokenListResponse>(`/api/circles/${circleId}/tokens`, {
    method: "GET",
  });
  return body.tokens;
}

export async function revokeCircleToken(circleId: string, tokenId: string) {
  return requestNoContent(`/api/circles/${circleId}/tokens/${tokenId}`, {
    method: "DELETE",
  });
}

// ─── Circle-token-authenticated: reads (used by external agents + web) ───────

export async function getCircleLeaderboard(circleId: string, circleToken: string) {
  const body = await requestJson<CircleLeaderboardResponse>(`/api/circles/${circleId}/leaderboard`, {
    method: "GET",
    headers: { Authorization: `Bearer ${circleToken}` },
  });
  return body.leaderboard;
}

export async function getCircleMemberHabits(circleId: string, userId: string, circleToken: string) {
  const body = await requestJson<CircleMemberHabitsResponse>(
    `/api/circles/${circleId}/members/${userId}/habits`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${circleToken}` },
    },
  );
  return body.habits;
}
