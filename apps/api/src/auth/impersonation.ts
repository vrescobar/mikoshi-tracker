import type { FastifyRequest } from "fastify";

import type { Db } from "../db/client";
import { getUserById } from "../modules/users/user.repository";
import { V1ApiError } from "../v1/errors";
import { getActAsUserId } from "./act-as";
import { resolveAdminOperator, type AdminOperator } from "./admin-key";
import { requireAuthenticatedUser, type AuthenticatedUser } from "./session";

/**
 * God-mode impersonation: a request that carries a valid admin credential plus
 * the `x-act-as-user` header (see ./act-as.ts) runs a normal `bearer` route AS
 * the named user, so the entire user-scoped API surface (entries,
 * events/check-ins, circles-as-owner) becomes usable for anyone without
 * per-action admin endpoints. Every impersonated mutation is attributed to the
 * resolving operator in the admin audit log.
 */
export { ACT_AS_HEADER } from "./act-as";

export interface ResolvedBearerPrincipal {
  user: AuthenticatedUser;
  /** Non-null when the caller is an admin acting as `user`; null for a normal user token. */
  impersonatedBy: AdminOperator | null;
}

/**
 * Resolve the user behind a `bearer` route. With the `x-act-as-user` header the
 * caller must present a valid admin credential (root key or named token); we then
 * load the target user and run as them. Without it, fall back to ordinary user
 * authentication (personal token or session).
 *
 * - No/invalid admin credential while impersonating → 401/503 (from `resolveAdminOperator`).
 * - Target user not found → 404.
 */
export async function resolveBearerOrImpersonation(
  request: FastifyRequest,
  db: Db,
): Promise<ResolvedBearerPrincipal> {
  const actAsUserId = getActAsUserId(request);

  if (!actAsUserId) {
    return { user: await requireAuthenticatedUser(request), impersonatedBy: null };
  }

  const operator = await resolveAdminOperator(request);
  const user = getUserById(db, actAsUserId);
  if (!user) {
    throw new V1ApiError(404, "NOT_FOUND", `Impersonation target user not found: ${actAsUserId}`);
  }

  // v1 bearer handlers only read `principal.user.id`; the full record is loaded so
  // any future field use (timezone, externalId, isAdmin) is already correct.
  return { user: user as unknown as AuthenticatedUser, impersonatedBy: operator };
}
