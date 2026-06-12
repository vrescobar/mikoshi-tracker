import type { FastifyInstance } from "fastify";

import { issueMagicLinkHandler } from "../admin/admin.controller";
import { platformProvisionHandler } from "./platform.controller";

/**
 * Extensions-platform contract namespace (story 50). These routes are the
 * machine contract between the Mikoshi runtime and this extension
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
  app.post("/api/platform/provision", platformProvisionHandler);
  // Identical handler in both namespaces — same input/response shapes.
  app.post("/api/platform/issue-magic-link", issueMagicLinkHandler);
}
