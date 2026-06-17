import { existsSync } from "node:fs";
import { join } from "node:path";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** apps/web/dist — the built SPA, sibling of apps/api. */
const WEB_DIST = join(import.meta.dir, "..", "..", "..", "web", "dist");

const API_PREFIXES = ["/api", "/magic", "/hooks"];

/**
 * Serve the built Vite SPA from a single Bun process (replacing the Caddy
 * reverse proxy). No-op when `apps/web/dist` is absent — in development Vite
 * serves the SPA and proxies /api + /magic to this server, so the API never
 * needs the static handler. In production `deploy.sh` builds the SPA first.
 */
export async function registerWebStatic(app: FastifyInstance): Promise<void> {
  if (!existsSync(join(WEB_DIST, "index.html"))) return;

  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

  // SPA fallback: any GET that isn't an API/magic/hooks/health route and didn't
  // match a static file returns index.html so client-side routes (deep links,
  // refresh) work. Everything else keeps a JSON 404.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0];
    const isApi = path === "/health" || API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    if (request.method === "GET" && !isApi) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ code: "NOT_FOUND", message: "Not found" });
  });
}
