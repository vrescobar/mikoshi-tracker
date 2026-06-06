// The admin god-mode credential is the static MIKOSHI_TRACKER_ADMIN_API_KEY.
// It is NEVER baked into the bundle: the operator pastes it at runtime and it
// is held in memory (mirrored to localStorage so it persists across visits,
// cleared on Lock or a 401). Serve this SPA only on a trusted origin.

const STORAGE_KEY = "mikoshi-tracker-admin-key";

let inMemoryKey: string | null = localStorage.getItem(STORAGE_KEY);

export function getAdminKey(): string | null {
  return inMemoryKey;
}

export function setAdminKey(key: string): void {
  inMemoryKey = key;
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearAdminKey(): void {
  inMemoryKey = null;
  localStorage.removeItem(STORAGE_KEY);
}
