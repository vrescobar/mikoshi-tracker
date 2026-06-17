import { overviewStatsSchema } from "@mikoshi-tracker/contracts/stats";

import { getRequestTimestamp, getRequestTimeZoneOverride } from "../../shared/controller-helpers";
import { getOverviewStats } from "../../modules/stats/stats.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const OverviewStats = registerSchema("OverviewStats", overviewStatsSchema);

export function statsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "stats",
      path: "/stats/overview",
      operationId: "statsOverview",
      summary: "30-day overview: today/weekly rates, trends, stability ranking",
      auth: "bearer",
      mutating: false,
      outputSchema: envelope(OverviewStats),
      handler: (ctx) =>
        getOverviewStats({ db: ctx.deps.sqlite }, {
          userId: requireUserId(ctx),
          timestamp: getRequestTimestamp(ctx.request),
          timeZone: getRequestTimeZoneOverride(ctx.request),
        }),
    },
  ];
}
