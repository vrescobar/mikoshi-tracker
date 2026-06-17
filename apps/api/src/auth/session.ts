import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import { getActAsUserId } from "./act-as";
import { findUserByApiToken } from "./api-token";
import { getUserById } from "../modules/users/user.repository";

export class AuthSessionError extends Error {
  constructor(
    public readonly statusCode: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AuthSessionError";
  }
}

export async function getSession(request: FastifyRequest) {
  return request.server.auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type AuthenticatedUser = AuthSession["user"];

export async function requireSession(request: FastifyRequest): Promise<AuthSession> {
  const session = await getSession(request);

  if (!session) {
    throw new AuthSessionError(401, "Authentication required");
  }

  return session;
}

function getBearerToken(request: FastifyRequest) {
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

export async function getAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const actAsUserId = getActAsUserId(request);

  if (actAsUserId) {
    return impersonatedUser(request, actAsUserId);
  }

  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    return findUserByApiToken(request.server.sqlite, bearerToken);
  }

  const session = await getSession(request);
  return session?.user ?? null;
}

/**
 * Legacy-route god-mode: `x-act-as-user` + a valid admin credential (root
 * key, AdminToken, or admin session) runs the route as the target user. This
 * is the single choke point every legacy user-scoped controller goes through
 * (habits, today, entries, events, aggregations, stats, circles, attachments,
 * skills), mirroring what resolveBearerOrImpersonation does for /api/v1.
 * Mutations are attributed to the operator by the global audit hook in
 * server.ts via `request.impersonation`.
 */
async function impersonatedUser(
  request: FastifyRequest,
  actAsUserId: string,
): Promise<AuthenticatedUser> {
  // Dynamic import: admin-key.ts statically imports this module (getSession),
  // so a static import here would create a cycle.
  const { resolveAdminOperator, AdminKeyError } = await import("./admin-key");

  let operator;
  try {
    operator = await resolveAdminOperator(request);
  } catch (error) {
    if (error instanceof AdminKeyError) {
      // Legacy controllers only understand AuthSessionError; an explicit
      // impersonation attempt without a valid admin credential is a plain 401.
      throw new AuthSessionError(401, "Authentication required");
    }
    throw error;
  }

  const target = getUserById(request.server.sqlite, actAsUserId);
  if (!target) {
    throw new AuthSessionError(404, `Impersonation target user not found: ${actAsUserId}`);
  }

  request.impersonation = { operator, userId: target.id };
  return target;
}

export async function requireAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    throw new AuthSessionError(401, "Authentication required");
  }

  return user;
}

export function assertOwnsUser(session: AuthSession, userId: string): void {
  if (session.user.id !== userId) {
    throw new AuthSessionError(403, "Forbidden");
  }
}
