import { z } from "zod";

/**
 * Canonical, typed error-code catalogue for the `/api/v1` surface.
 *
 * This is the single source of truth shared by the API, the MCP package, the
 * web app, and the admin SPA. It is the superset of every `code: "..."` literal
 * the API currently emits (collected by grep over `apps/api/src`) plus the
 * cross-cutting codes the v1 envelope introduces (`INVALID_PAGINATION`,
 * `RATE_LIMITED`, `INTERNAL_ERROR`, `GONE`).
 *
 * The legacy `/api` surface keeps its own narrow `publicApiErrorCodeSchema`
 * (see `./api`); this enum is intentionally separate so the legacy spec and its
 * live consumers (web, MCP, openclaw) are never touched.
 */
export const errorCodeSchema = z.enum([
  // generic / transport
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "GONE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INVALID_PAGINATION",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
  // domain
  "HABIT_INACTIVE",
  "ENTRY_INACTIVE",
  "CIRCLE_CLOSED",
  "EVENT_DELETED",
  "NOTHING_TO_UNDO",
  "UNDO_NOT_CIRCLE_SOURCED",
  "NOT_A_MEMBER",
  "SAME_USER",
  "ATTACHMENT_FILE_MISSING",
  "ATTACHMENT_LIMIT_REACHED",
  "ATTACHMENT_TOO_LARGE",
  "RUNNER_ERROR",
  "RUNNER_TIMEOUT",
  "RUNNER_UNREACHABLE",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
