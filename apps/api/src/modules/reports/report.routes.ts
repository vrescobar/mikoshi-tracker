import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "../../auth/webhook-signature";
import { runWeeklyReports } from "./weekly-report.service";

/**
 * POST /hooks/cron/weekly-report — fired by the Mikoshi kernel on a schedule
 * (requires the cronWebhooks capability grant). Same security posture as
 * /hooks/identity: the HMAC signature over `timestamp + "." + rawBody` IS the
 * credential (no bearer), with a 5-minute anti-replay window. Renders + delivers
 * the weekly chart to every opted-in user.
 */
async function weeklyReportWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  if (!adminKey) {
    return reply.status(503).send({
      code: "SERVICE_UNAVAILABLE",
      message: "Weekly report webhook is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not set)",
    });
  }

  const timestamp = request.headers[WEBHOOK_TIMESTAMP_HEADER];
  const signature = request.headers[WEBHOOK_SIGNATURE_HEADER];
  const valid =
    typeof timestamp === "string" &&
    typeof signature === "string" &&
    typeof request.rawBody === "string" &&
    verifyWebhookSignature({ adminKey, timestamp, rawBody: request.rawBody, signature });
  if (!valid) {
    return reply.status(401).send({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
  }

  const summary = await runWeeklyReports(
    { db: request.server.db, sqlite: request.server.sqlite },
    { platform: request.server.mikoshiPlatform },
  );
  return { ok: true, ...summary };
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.post("/hooks/cron/weekly-report", weeklyReportWebhookHandler);
}
