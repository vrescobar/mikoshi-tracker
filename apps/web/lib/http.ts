import { ACT_AS_HEADER } from "@mikoshi-tracker/contracts/api";

import { createApiUrl } from "./api";
import { getActAs } from "./impersonation";

/**
 * Single fetch choke point for every API client. All requests go through
 * apiFetch so cross-cutting concerns (credentials, impersonation header,
 * future tracing) live in exactly one place, and failures carry the HTTP
 * status so pages can distinguish "not found" from "broken".
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export async function readErrorMessage(response: Response): Promise<string> {
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

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };

  // God-mode: while an admin "views as" a user, every API call runs as the
  // target — except the auth surface, which must keep operating on the
  // admin's own session, and except calls that already set the header
  // explicitly (the admin console's asUser() helpers).
  const actAs = getActAs();
  if (actAs && !path.startsWith("/api/auth") && headers[ACT_AS_HEADER] === undefined) {
    headers[ACT_AS_HEADER] = actAs.userId;
  }

  return fetch(createApiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
}
