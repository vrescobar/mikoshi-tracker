import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

export class AdminKeyError extends Error {
  constructor(
    public readonly statusCode: 401 | 503,
    message: string,
  ) {
    super(message);
    this.name = "AdminKeyError";
  }
}

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

/**
 * Fastify preHandler: validates `Authorization: Bearer <key>` against
 * `MIKOSHI_TRACKER_ADMIN_API_KEY` using a timing-safe compare.
 *
 * - Env var unset or empty → 503 (feature disabled, never an open endpoint)
 * - Missing/wrong key → 401
 */
export async function requireAdminKey(request: FastifyRequest): Promise<void> {
  const configuredKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;

  if (!configuredKey) {
    throw new AdminKeyError(
      503,
      "Admin provisioning API is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not set)",
    );
  }

  const bearer = getBearerToken(request);

  if (!bearer) {
    throw new AdminKeyError(401, "Admin API key required");
  }

  const configuredBuf = Buffer.from(configuredKey, "utf8");
  const bearerBuf = Buffer.from(bearer, "utf8");

  const lengthsMatch = configuredBuf.length === bearerBuf.length;

  // Always run timingSafeEqual to avoid a timing oracle on key length.
  // When lengths differ, compare configuredBuf against itself; the result is
  // discarded and we reject on the lengthsMatch guard below.
  const safeResult = timingSafeEqual(
    configuredBuf,
    lengthsMatch ? bearerBuf : configuredBuf,
  );

  if (!lengthsMatch || !safeResult) {
    throw new AdminKeyError(401, "Invalid admin API key");
  }
}
