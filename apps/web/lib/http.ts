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
  // target — except surfaces that must keep operating as the admin: the auth
  // routes, api-access (the API ignores the header there, so sending it would
  // silently rotate the ADMIN'S own token while the UI claims to act on the
  // target), and the admin console's own endpoints. Calls that already set
  // the header explicitly (the asUser() helpers) are left untouched.
  const actAs = getActAs();
  const adminOwnSurface =
    path.startsWith("/api/auth") ||
    path.startsWith("/api/api-access") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/v1/admin");
  if (actAs && !adminOwnSurface && headers[ACT_AS_HEADER] === undefined) {
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
