import { getPersonalApiToken, resetPersonalApiToken } from "../../auth/api-token";
import type { Db } from "../../db/client";
import { getUserByExternalId, getUserById } from "../users/user.repository";

type Deps = { sqlite: Db };
type UserRef = { userId?: string; externalId?: string };

export class AdminUserNotFoundError extends Error {
  constructor() {
    super("No user found for the given userId/externalId");
    this.name = "AdminUserNotFoundError";
  }
}

function resolveUserId(db: Db, ref: UserRef): string {
  if (ref.userId) {
    const user = getUserById(db, ref.userId);
    if (user) return user.id;
  }
  if (ref.externalId) {
    const user = getUserByExternalId(db, ref.externalId);
    if (user) return user.id;
  }
  throw new AdminUserNotFoundError();
}

/**
 * Read-only personal-token metadata. Tokens are stored as SHA-256 hashes, so the
 * plaintext can NEVER be retrieved — only whether one exists and when it changed.
 */
export async function readUserTokenMeta(deps: Deps, ref: UserRef) {
  const userId = resolveUserId(deps.sqlite, ref);
  const record = await getPersonalApiToken(deps.sqlite, userId);
  return {
    userId,
    hasToken: record != null,
    createdAt: record?.createdAt.toISOString() ?? null,
    updatedAt: record?.updatedAt.toISOString() ?? null,
  };
}

/**
 * Idempotent provision: mint a personal token ONLY if the user has none, so a
 * companion product (mikoshi) can guarantee a token exists without the surprise
 * rotation that `reset-token` causes. The plaintext is returned exactly once, on
 * creation; an existing token is reported as metadata only (never re-revealed).
 */
export async function ensureUserToken(deps: Deps, ref: UserRef) {
  const userId = resolveUserId(deps.sqlite, ref);
  const existing = await getPersonalApiToken(deps.sqlite, userId);
  if (existing) {
    return {
      userId,
      created: false,
      hasToken: true,
      token: null as string | null,
      updatedAt: existing.updatedAt.toISOString(),
    };
  }
  const minted = await resetPersonalApiToken(deps.sqlite, userId);
  return {
    userId,
    created: true,
    hasToken: true,
    token: minted.token,
    updatedAt: minted.updatedAt.toISOString(),
  };
}
