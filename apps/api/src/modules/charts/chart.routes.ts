import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import { isChartKind, renderChartPng } from "./chart.service";

/**
 * GET /api/charts/:kind.png — render a per-user nutrition chart as a PNG.
 *
 * Bearer/session authenticated and strictly scoped to the caller (never accepts
 * a userId). Binary stream, so it sits outside the v1 {ok,data} envelope (the
 * report skill fetches it and delivers it over WhatsApp). `:kind` accepts an
 * optional .png suffix so the URL reads like a file.
 */
async function chartHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const rawKind = (request.params as { kind: string }).kind.replace(/\.png$/i, "");
    if (!isChartKind(rawKind)) {
      reply.code(404);
      return { error: "unknown_chart_kind", kind: rawKind };
    }

    const range = (request.query as { range?: string } | undefined)?.range;
    const png = await renderChartPng(
      { db: request.server.db, sqlite: request.server.sqlite },
      { userId: user.id, kind: rawKind, range, timestamp: getRequestTimestamp(request) },
    );

    reply.header("Cache-Control", "private, max-age=300");
    reply.type("image/png");
    reply.header("Content-Length", png.length);
    return await reply.send(png);
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    throw error;
  }
}

export async function registerChartRoutes(app: FastifyInstance) {
  app.get("/api/charts/:kind", chartHandler);
}
