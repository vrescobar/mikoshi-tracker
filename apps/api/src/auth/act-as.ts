import type { FastifyRequest } from "fastify";

import type { AdminOperator } from "./admin-key";

/**
 * God-mode impersonation header: a request that carries a valid admin
 * credential plus this header runs a user-scoped route AS the named user.
 * Kept in its own module (no runtime imports from session/admin-key) so both
 * the session choke point and the v1 router can share it without cycles.
 * Re-exported from @mikoshi-tracker/contracts/api as the cross-app SSOT.
 */
export { ACT_AS_HEADER } from "@mikoshi-tracker/contracts/api";
import { ACT_AS_HEADER } from "@mikoshi-tracker/contracts/api";

/** Set on the request when an admin impersonates a user via `x-act-as-user`. */
export interface ImpersonationContext {
  operator: AdminOperator;
  userId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    impersonation?: ImpersonationContext;
  }
}

export function getActAsUserId(request: FastifyRequest): string | null {
  const header = request.headers[ACT_AS_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
