import { z } from "zod";

import { listResponse, mutationEnvelope } from "@mikoshi-tracker/contracts/envelope";

import { V1ApiError } from "./errors";
import type { AdminOperator } from "../auth/admin-key";
import type { V1Context } from "./match";

/** Narrows the resolved principal to a user id (bearer routes). */
export function requireUserId(ctx: V1Context): string {
  if (ctx.principal.kind === "user") return ctx.principal.user.id;
  throw new V1ApiError(401, "UNAUTHORIZED", "Authentication required");
}

/** Narrows the resolved principal to the admin operator (admin-key routes). */
export function requireAdminOperator(ctx: V1Context): AdminOperator {
  if (ctx.principal.kind === "admin") return ctx.principal.operator;
  throw new V1ApiError(401, "UNAUTHORIZED", "Admin authentication required");
}

/** Narrows the resolved principal to a circle id (circle-token routes). */
export function requireCircleId(ctx: V1Context): string {
  if (ctx.principal.kind === "circle") return ctx.principal.circleId;
  throw new V1ApiError(403, "FORBIDDEN", "Circle context required");
}

/** outputSchema for a single-item mutation/detail: `{ ok: true, data: item }`. */
export function envelopeOne<T extends z.ZodType>(item: T) {
  return mutationEnvelope(item);
}

/** outputSchema for a paginated list: `{ ok: true, data: { items, total } }`. */
export function envelopeList<T extends z.ZodType>(item: T) {
  return mutationEnvelope(listResponse(item));
}

/** outputSchema for an arbitrary typed data payload. */
export function envelope<T extends z.ZodType>(data: T) {
  return mutationEnvelope(data);
}
