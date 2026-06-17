import type { FastifyInstance } from "fastify";

import { requireAdminKey } from "../../auth/admin-key";
import { getUserByExternalId } from "../users/user.repository";
import { issueMagicLinkHandler, sendAdminError } from "../admin/admin.controller";
import { sweepMergedIdentities } from "./identity-lifecycle";
import { createMikoshiPlatformClient } from "./mikoshi-platform-client";
import { pullAllCohortCircles } from "./membership-sync";
import {
  identityWebhookHandler,
  platformBackupHandler,
  platformMembershipHandler,
  platformProvisionHandler,
} from "./platform.controller";

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

  // Same handler as the admin alias, plus two platform behaviours:
  //  - lazy merge net (story 52): an unknown externalId may be the survivor
  //    of a Mikoshi merge — sweep our stored ids before letting the handler
  //    404. Gated by the admin credential FIRST so unauthenticated requests
  //    can never trigger outbound sweeps (the handler re-checks, harmless).
  //  - SSO roster refresh (story 51): issuing a login link means a human is
  //    about to look at their circles, so pull the cohort rosters after.
  // Both are best-effort and bounded (client timeout) — a down Mikoshi must
  // never block a magic link.
  app.post("/api/platform/issue-magic-link", async (request, reply) => {
    try {
      await requireAdminKey(request);
    } catch (error) {
      return sendAdminError(reply, error);
    }

    if (app.mikoshiPlatform) {
      const externalId = (request.body as { externalId?: unknown } | null)?.externalId;
      if (typeof externalId === "string" && externalId.length > 0) {
        const known = getUserByExternalId(app.sqlite, externalId);
        if (!known) {
          try {
            await sweepMergedIdentities(app.sqlite, app.mikoshiPlatform);
          } catch (error) {
            request.log.error({ err: error }, "lazy identity sweep before SSO failed");
          }
        }
      }
    }

    const out = await issueMagicLinkHandler(request, reply);
    if (reply.statusCode === 201 && app.mikoshiPlatform) {
      try {
        await pullAllCohortCircles(app.sqlite, app.mikoshiPlatform);
      } catch (error) {
        request.log.error({ err: error }, "cohort roster pull after SSO failed");
      }
    }
    return out;
  });

  app.post("/api/platform/membership", platformMembershipHandler);

  // Push leg of the identity lifecycle (story 52). Signature-authenticated —
  // see identityWebhookHandler. Reachable only on the private plane; the
  // public edge 404s /hooks/* via vhost hardening (story 63).
  app.post("/hooks/identity", identityWebhookHandler);

  // Snapshot-pull de respaldo (BKP-1). Como /hooks/identity, la firma HMAC ES
  // la credencial (sin bearer): solo Mikoshi, que posee la admin key, puede
  // disparar el dump. Plano privado únicamente.
  app.post("/api/platform/backup", platformBackupHandler);
}
