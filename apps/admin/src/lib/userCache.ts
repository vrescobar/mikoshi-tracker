import { adminApi, type AdminUser } from "./api";

// There is no GET /admin/users/:id, so we keep a small in-memory cache populated
// by the Users list and lazily backfilled by a single bulk fetch (admin user
// counts on a self-hosted tracker are modest). Lets UserDetail render a real
// profile header on deep-link/refresh, not just an id.

const cache = new Map<string, AdminUser>();

export function cacheUsers(users: AdminUser[]): void {
  for (const u of users) cache.set(u.id, u);
}

export function getCachedUser(id: string): AdminUser | undefined {
  return cache.get(id);
}

export async function resolveUser(id: string): Promise<AdminUser | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const { items } = await adminApi.listUsers({ limit: 500 });
  cacheUsers(items);
  return cache.get(id) ?? null;
}
