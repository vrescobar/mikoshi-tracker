import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { findAdminTokenByValue } from "./admin-token";

export class AdminKeyError extends Error {
  constructor(
    public readonly statusCode: 401 | 503,
    message: string,
  ) {
    super(message);
    this.name = "AdminKeyError";
  }
}

/**
 * The resolved identity behind an admin request: the static root key (`env`) or
 * a named AdminToken (`token`). Lets god-mode actions be attributed to a specific
 * operator/bot in the audit log.
 */
export type AdminOperator =
  | { type: "env"; id: "env"; label: string }
  | { type: "token"; id: string; label: string };

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ", 2);

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

/** Timing-safe compare of a presented bearer against the static root key. */
function matchesStaticKey(bearer: string, configuredKey: string): boolean {
  const configuredBuf = Buffer.from(configuredKey, "utf8");
  const bearerBuf = Buffer.from(bearer, "utf8");
  const lengthsMatch = configuredBuf.length === bearerBuf.length;
  // Always run timingSafeEqual to avoid a timing oracle on key length.
  const safeResult = timingSafeEqual(configuredBuf, lengthsMatch ? bearerBuf : configuredBuf);
  return lengthsMatch && safeResult;
}

/**
 * Resolve the admin identity behind a request. Accepts either the static root
 * key (`MIKOSHI_TRACKER_ADMIN_API_KEY`) or a live named AdminToken.
 *
 * - Root key unset/empty → 503 (feature disabled, never an open endpoint)
 * - Missing/wrong credential → 401
 */
export async function resolveAdminOperator(request: FastifyRequest): Promise<AdminOperator> {
  const configuredKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;

  if (!configuredKey) {
    throw new AdminKeyError(503, "Admin provisioning API is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not set)");
  }

  const bearer = getBearerToken(request);
  if (!bearer) {
    throw new AdminKeyError(401, "Admin API key required");
  }

  if (matchesStaticKey(bearer, configuredKey)) {
    return { type: "env", id: "env", label: "root" };
  }

  const named = await findAdminTokenByValue(request.server.db, bearer);
  if (named) {
    return { type: "token", id: named.tokenId, label: named.label };
  }

  throw new AdminKeyError(401, "Invalid admin API key");
}

/**
 * Fastify preHandler: require any valid admin credential (root key or a named
 * token). Kept for the legacy `/api/admin/*` routes; v1 uses resolveAdminOperator
 * directly so it can attribute actions to the operator.
 */
export async function requireAdminKey(request: FastifyRequest): Promise<void> {
  await resolveAdminOperator(request);
}
