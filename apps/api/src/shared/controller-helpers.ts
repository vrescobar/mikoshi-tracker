import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError } from "../auth/session";
import { isValidTimeZone } from "./timezone";

export function sendAuthError(reply: FastifyReply, error: AuthSessionError): void {
  const code =
    error.statusCode === 401 ? "UNAUTHORIZED" : error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN";
  reply.status(error.statusCode).send({
    code,
    message: error.message,
  });
}

export function getRequestTimestamp(request: FastifyRequest) {
  const header = request.headers["x-mikoshi-tracker-now"];

  if (request.server.env.NODE_ENV === "test" && typeof header === "string" && header.length > 0) {
    return header;
  }

  return new Date();
}

/**
 * Optional per-request IANA timezone override (`X-Mikoshi-Tracker-TZ`). Lets a
 * frontend render "today" in a zone other than the user's stored `timezone`
 * (e.g. a shared contest microsite). Returns undefined when absent or invalid,
 * so callers fall back to the stored timezone. Unlike `X-Mikoshi-Tracker-Now`
 * this is honoured in every environment, not just test.
 */
export function getRequestTimeZoneOverride(request: FastifyRequest): string | undefined {
  const header = request.headers["x-mikoshi-tracker-tz"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return undefined;
  const tz = value.trim();
  return tz.length > 0 && isValidTimeZone(tz) ? tz : undefined;
}
