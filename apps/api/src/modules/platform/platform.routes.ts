import type { FastifyInstance } from "fastify";

import { issueMagicLinkHandler } from "../admin/admin.controller";
import { createMikoshiPlatformClient } from "./mikoshi-platform-client";
import { pullAllCohortCircles } from "./membership-sync";
import { platformMembershipHandler, platformProvisionHandler } from "./platform.controller";

/**
 * Extensions-platform contract namespace (stories 50–51). These routes are
 * the machine contract between the Mikoshi runtime and this extension
 * (`~/projects/mikoshi-stack/docs/contract-summary.md`); they are reachable
 * only on the private plane and intentionally NOT part of the public OpenAPI
 * surface (the public edge 404s `/api/platform/*` — hardening story 63).
 *
 * The legacy `/api/admin/*` aliases stay registered in admin.routes.ts: the
 * hardcoded MikoshiTrackerProvisionService keeps calling them until the
 * provision switch (story 54), and the `/admin` operator console uses the
 * admin surface beyond these two endpoints.
 */
export async function registerPlatformRoutes(app: FastifyInstance) {
  // Client of the Mikoshi Platform API (null when MIKOSHI_PLATFORM_API_URL
  // is unset — every pull then degrades to a silent no-op).
  app.decorate("mikoshiPlatform", createMikoshiPlatformClient(app));

  app.post("/api/platform/provision", platformProvisionHandler);

  // Same handler as the admin alias, plus the SSO roster refresh: issuing a
  // login link means a human is about to look at their circles, so pull the
  // cohort rosters first. Best-effort and bounded (client timeout) — a down
  // Mikoshi must never block a magic link.
  app.post("/api/platform/issue-magic-link", async (request, reply) => {
    const out = await issueMagicLinkHandler(request, reply);
    if (reply.statusCode === 201 && app.mikoshiPlatform) {
      try {
        await pullAllCohortCircles(app.db, app.mikoshiPlatform);
      } catch (error) {
        request.log.error({ err: error }, "cohort roster pull after SSO failed");
      }
    }
    return out;
  });

  app.post("/api/platform/membership", platformMembershipHandler);
}
