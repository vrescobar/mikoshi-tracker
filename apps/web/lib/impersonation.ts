/**
 * God-mode "view as user" client state. sessionStorage-scoped on purpose: it
 * dies with the tab and never leaks into another admin session. lib/http.ts
 * reads it synchronously on every request to inject the X-Act-As-User header;
 * React subscribes via useSyncExternalStore (see src/admin/impersonation.tsx).
 */

const STORAGE_KEY = "mikoshi.act-as";

export type ActAsTarget = { userId: string; name: string };

let cached: ActAsTarget | null | undefined;
const listeners = new Set<() => void>();

function read(): ActAsTarget | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActAsTarget;
    return typeof parsed.userId === "string" && parsed.userId.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function getActAs(): ActAsTarget | null {
  if (cached === undefined) {
    cached = read();
  }
  return cached;
}

export function setActAs(target: ActAsTarget): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  cached = target;
  listeners.forEach((listener) => listener());
}

export function clearActAs(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  cached = null;
  listeners.forEach((listener) => listener());
}

export function subscribeActAs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
