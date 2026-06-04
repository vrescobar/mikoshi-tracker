import { z } from "zod";

import { todaySummarySchema } from "@mikoshi-tracker/contracts/today";

import { getRequestTimestamp, getRequestTimeZoneOverride } from "../../shared/controller-helpers";
import { getTodaySummary } from "../../modules/today/today.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const TodaySummary = registerSchema("TodaySummary", todaySummarySchema);

const todaySummaryResponseSchema = z.object({ summary: TodaySummary });

export function todayV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "today",
      path: "/today/summary",
      operationId: "todaySummary",
      summary: "Today's pending/completed habits with completion rate",
      auth: "bearer",
      mutating: false,
      outputSchema: envelope(todaySummaryResponseSchema),
      handler: (ctx) =>
        getTodaySummary(ctx.deps, {
          userId: requireUserId(ctx),
          timestamp: getRequestTimestamp(ctx.request),
          timeZone: getRequestTimeZoneOverride(ctx.request),
        }),
    },
  ];
}
