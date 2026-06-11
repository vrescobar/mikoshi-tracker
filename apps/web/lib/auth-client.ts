import type { ApiAccessTokenResponse } from "@mikoshi-tracker/contracts/api";
import type { AttachmentListResponse } from "@mikoshi-tracker/contracts/attachments";
import type {
  CreateHabitInput,
  HabitDetail,
  HabitListFilters,
  UpdateHabitInput,
  Weekday,
} from "@mikoshi-tracker/contracts/habits";
import type { OverviewStats } from "@mikoshi-tracker/contracts/stats";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

import { createApiUrl } from "./api";

export type HabitRecord = {
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

export type SessionPayload = {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
  };
  timezone?: string;
  /** Present when an admin is viewing the app as this user (god-mode). */
  impersonating?: {
    operator: { type: "env" | "token" | "session"; label: string };
  };
};

type TodaySummaryResponse = {
  summary: TodaySummary;
};

type OverviewStatsResponse = {
  overview: OverviewStats;
};

type ApiAccessTokenResponseBody = ApiAccessTokenResponse;

type RegistrationStatusResponse = {
  registrationEnabled: boolean;
  hasUsers: boolean;
};

type AdminRegistrationResponse = {
  registrationEnabled: boolean;
};

type TodayActionInput = {
  habitId: string;
  source?: "web" | "ai" | "system";
  note?: string | null;
};

type SetTodayTotalInput = TodayActionInput & {
  total: number;
};

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  name: string;
  timezone?: string;
};

function getBrowserTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone : undefined;
  } catch {
    return undefined;
  }
}

async function readErrorMessage(response: Response) {
  const text = await response.text();

  if (!text) {
    return response.statusText;
  }

  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message ?? text;
  } catch {
    return text;
  }
}

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
    headers: {
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function signUp(input: SignUpInput) {
  return requestJson<{ user: { id: string; email: string; name: string } }>("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      timezone: input.timezone ?? getBrowserTimeZone(),
    }),
  });
}

export async function signIn(input: SignInInput) {
  return requestJson<{ token?: string }>("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function signOut() {
  return requestNoContent("/api/auth/sign-out", {
    method: "POST",
  });
}

export async function listHabits(filters?: Partial<HabitListFilters>) {
  const body = await requestJson<{ items: HabitRecord[] }>(buildHabitListPath(filters), {
    method: "GET",
  });

  return body.items;
}

export async function createHabit(input: CreateHabitInput) {
  const body = await requestJson<{ item: HabitRecord }>("/api/habits", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return body.item;
}

export async function updateHabit(habitId: string, input: UpdateHabitInput) {
  const body = await requestJson<{ item: HabitRecord }>(`/api/habits/${habitId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return body.item;
}

export async function getHabitDetail(habitId: string) {
  const body = await requestJson<{ item: HabitDetail }>(`/api/habits/${habitId}`, {
    method: "GET",
  });

  return body.item;
}

export async function archiveHabit(habitId: string) {
  const body = await requestJson<{ item: HabitRecord }>(`/api/habits/${habitId}/archive`, {
    method: "POST",
  });

  return body.item;
}

export async function restoreHabit(habitId: string) {
  const body = await requestJson<{ item: HabitRecord }>(`/api/habits/${habitId}/restore`, {
    method: "POST",
  });

  return body.item;
}

export async function getTodaySummary() {
  const body = await requestJson<TodaySummaryResponse>("/api/today", {
    method: "GET",
  });

  return body.summary;
}

export async function getOverviewStats() {
  const body = await requestJson<OverviewStatsResponse>("/api/stats/overview", {
    method: "GET",
  });

  return body.overview;
}

export async function getApiAccessToken() {
  return requestJson<ApiAccessTokenResponseBody>("/api/api-access/token", {
    method: "GET",
  });
}

export async function resetApiAccessToken() {
  return requestJson<ApiAccessTokenResponseBody>("/api/api-access/token/reset", {
    method: "POST",
  });
}

/** Current session, or null when not signed in (401). */
export async function getSession(): Promise<SessionPayload | null> {
  const response = await fetch(createApiUrl("/api/session"), {
    credentials: "include",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to validate session");
  }
  return (await response.json()) as SessionPayload;
}

export async function getRegistrationStatus() {
  return requestJson<RegistrationStatusResponse>("/api/auth/registration", {
    method: "GET",
  });
}

export async function getAdminRegistrationSettings() {
  return requestJson<AdminRegistrationResponse>("/api/admin/registration", {
    method: "GET",
  });
}

export async function updateAdminRegistrationSettings(registrationEnabled: boolean) {
  return requestJson<AdminRegistrationResponse>("/api/admin/registration", {
    method: "POST",
    body: JSON.stringify({
      registrationEnabled,
    }),
  });
}

export async function completeTodayHabit(input: TodayActionInput) {
  return requestJson<TodaySummaryResponse & { affectedHabit: HabitRecord }>("/api/today/complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setTodayHabitTotal(input: SetTodayTotalInput) {
  return requestJson<TodaySummaryResponse & { affectedHabit: HabitRecord }>("/api/today/set-total", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function undoTodayHabit(input: TodayActionInput) {
  return requestJson<TodaySummaryResponse & { affectedHabit: HabitRecord }>("/api/today/undo", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listHabitAttachments(habitId: string) {
  return requestJson<AttachmentListResponse>(`/api/attachments?habitId=${encodeURIComponent(habitId)}`, {
    method: "GET",
  });
}

export async function uploadHabitAttachments(habitId: string, files: File[]) {
  const form = new FormData();
  form.set("habitId", habitId);
  for (const file of files) {
    form.append("files", file);
  }

  // No explicit content-type header: the browser sets the multipart boundary.
  const response = await fetch(createApiUrl("/api/attachments"), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as AttachmentListResponse;
}

export async function deleteAttachment(attachmentId: string) {
  return requestNoContent(`/api/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
  });
}

/** Absolute URL for an attachment's binary, usable directly as an <img> src. */
export function attachmentFileUrl(attachmentId: string) {
  return createApiUrl(`/api/attachments/${encodeURIComponent(attachmentId)}/file`);
}
