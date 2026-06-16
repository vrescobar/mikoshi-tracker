import { ApiError, apiFetch, readErrorMessage } from "./http";

/**
 * Thin client for the `/api/v1` RPC surface. Every v1 response is the
 * `{ ok, data }` envelope (see @mikoshi-tracker/contracts/envelope); these
 * helpers unwrap it and surface a typed ApiError on the `{ ok: false }` shape,
 * so callers receive `data` directly and never touch the envelope.
 */

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

async function unwrap<T>(response: Response): Promise<T> {
  const raw = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (raw && typeof raw === "object" && "ok" in raw) {
    if (raw.ok) return raw.data;
    throw new ApiError(response.status, raw.error);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  return raw as T;
}

export async function getV1<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const search = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
  }
  const qs = search.toString();
  const response = await apiFetch(`/api/v1${path}${qs ? `?${qs}` : ""}`);
  return unwrap<T>(response);
}

export async function postV1<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return unwrap<T>(response);
}
