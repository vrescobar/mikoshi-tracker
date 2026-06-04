import { getPersonalApiToken, resetPersonalApiToken } from "../../auth/api-token";
import type { PrismaClient } from "../../generated/prisma/client";
import { findUserByExternalId } from "../circles/circle.repository";

type Deps = { db: PrismaClient };
type UserRef = { userId?: string; externalId?: string };

export class AdminUserNotFoundError extends Error {
  constructor() {
    super("No user found for the given userId/externalId");
    this.name = "AdminUserNotFoundError";
  }
}

async function resolveUserId(db: PrismaClient, ref: UserRef): Promise<string> {
  if (ref.userId) {
    const user = await db.user.findUnique({ where: { id: ref.userId }, select: { id: true } });
    if (user) return user.id;
  }
  if (ref.externalId) {
    const user = await findUserByExternalId(db, ref.externalId);
    if (user) return user.id;
  }
  throw new AdminUserNotFoundError();
}

/**
 * Read-only personal-token metadata. Tokens are stored as SHA-256 hashes, so the
 * plaintext can NEVER be retrieved — only whether one exists and when it changed.
 */
export async function readUserTokenMeta(deps: Deps, ref: UserRef) {
  const userId = await resolveUserId(deps.db, ref);
  const record = await getPersonalApiToken(deps.db, userId);
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
  const userId = await resolveUserId(deps.db, ref);
  const existing = await getPersonalApiToken(deps.db, userId);
  if (existing) {
    return {
      userId,
      created: false,
      hasToken: true,
      token: null as string | null,
      updatedAt: existing.updatedAt.toISOString(),
    };
  }
  const minted = await resetPersonalApiToken(deps.db, userId);
  return {
    userId,
    created: true,
    hasToken: true,
    token: minted.token,
    updatedAt: minted.updatedAt.toISOString(),
  };
}
