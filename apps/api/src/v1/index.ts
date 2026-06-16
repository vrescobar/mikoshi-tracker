import type { FastifyInstance } from "fastify";

import { generateV1OpenApi } from "./openapi";
import { registerV1Routes } from "./router";
import { entriesV1Routes, entryTypesV1Routes } from "./resources/entries";
import { eventsV1Routes } from "./resources/events";
import { todayV1Routes } from "./resources/today";
import { checkinsV1Routes } from "./resources/checkins";
import { aggregationsV1Routes } from "./resources/aggregations";
import { statsV1Routes } from "./resources/stats";
import { circlesV1Routes } from "./resources/circles";
import { attachmentsV1Routes } from "./resources/attachments";
import { skillsV1Routes } from "./resources/skills";
import { adminV1Routes } from "./resources/admin";
import { dietV1Routes } from "./resources/diet";
import type { ApiV1Deps, V1RouteMeta } from "./match";

export { generateV1OpenApi } from "./openapi";
export type { ApiV1Deps, V1RouteMeta } from "./match";

/**
 * Assembles the full `/api/v1` route table from the per-resource sub-tables.
 * Pure function of `deps` so tests can build and inspect it without a server.
 * Resource sub-tables are added incrementally (stages 3–4).
 */
export function buildV1RouteTable(deps: ApiV1Deps): V1RouteMeta[] {
  return [
    ...entryTypesV1Routes(deps),
    ...entriesV1Routes(deps),
    ...eventsV1Routes(deps),
    ...todayV1Routes(deps),
    ...checkinsV1Routes(deps),
    ...aggregationsV1Routes(deps),
    ...statsV1Routes(deps),
    ...circlesV1Routes(deps),
    ...attachmentsV1Routes(deps),
    ...skillsV1Routes(deps),
    ...adminV1Routes(deps),
    ...dietV1Routes(deps),
  ];
}

const VERSION = "1";

/**
 * Mounts the `/api/v1` surface alongside the untouched legacy `/api` routes.
 * Discovery (`GET /api/v1`) and the spec (`GET /api/v1/openapi.json`) are
 * registered directly so they return raw documents, not the `{ok,data}`
 * envelope used by resource routes.
 */
export async function registerV1(app: FastifyInstance): Promise<void> {
  const deps: ApiV1Deps = { db: app.db };
  const routes = buildV1RouteTable(deps);

  registerV1Routes(app, deps, routes);

  app.get("/api/v1/openapi.json", async () => generateV1OpenApi(buildV1RouteTable({ db: app.db })));

  app.get("/api/v1", async () => {
    const table = buildV1RouteTable({ db: app.db });
    const resources = [...new Set(table.map((route) => route.resource))].sort();
    return {
      version: VERSION,
      resources,
      openapi: "/api/v1/openapi.json",
      operationCount: table.length,
    };
  });
}
