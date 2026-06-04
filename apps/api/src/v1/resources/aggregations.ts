import { z } from "zod";

import { aggregationFiltersSchema, aggregationResponseSchema } from "@mikoshi-tracker/contracts/aggregations";

import { computeAggregations } from "../../modules/aggregations/aggregation.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const AggregationResponse = registerSchema("AggregationResponse", aggregationResponseSchema);

/**
 * The aggregations query is the contract the diet/kcal page consumes. The query
 * language (documented here, previously undocumented):
 *   - entryTypeSlug (required), entryId? — scope to a type, optionally one entry
 *   - from / to (YYYY-MM-DD) — inclusive date range
 *   - groupBy: day | week | month | none — temporal bucketing
 *   - fields? — CSV of EntryType sumFields to total (default: all)
 *   - include? — CSV extras; "missing_days" emits zero buckets for empty dates
 *   - groupByPayload? — group by a payload field (e.g. food name) instead of dates
 *   - limit? — cap on payload-grouped buckets
 */
export function aggregationsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "aggregations",
      path: "/aggregations",
      operationId: "aggregationsQuery",
      summary: "Aggregate entry payloads over a date range (powers the diet/kcal page)",
      auth: "bearer",
      mutating: false,
      querySchema: aggregationFiltersSchema,
      outputSchema: envelope(AggregationResponse),
      handler: (ctx) => {
        const query = ctx.query as z.infer<typeof aggregationFiltersSchema>;
        return computeAggregations(ctx.deps, { userId: requireUserId(ctx), ...query });
      },
    },
  ];
}
