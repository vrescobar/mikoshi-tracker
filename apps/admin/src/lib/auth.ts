// The admin god-mode credential is the static MIKOSHI_TRACKER_ADMIN_API_KEY.
// It is NEVER baked into the bundle: the operator pastes it at runtime and it
// is held in memory (mirrored to sessionStorage so a refresh doesn't log out,
// cleared when the tab closes). Serve this SPA only on a trusted origin.

const STORAGE_KEY = "mikoshi-tracker-admin-key";

let inMemoryKey: string | null = sessionStorage.getItem(STORAGE_KEY);

export function getAdminKey(): string | null {
  return inMemoryKey;
}

export function setAdminKey(key: string): void {
  inMemoryKey = key;
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearAdminKey(): void {
  inMemoryKey = null;
  sessionStorage.removeItem(STORAGE_KEY);
}
