import { z } from "zod";
import type { FastifyInstance } from "fastify";

import {
  commonAuthErrorResponses,
  commonNotFoundResponse,
} from "@mikoshi-tracker/contracts/api";
import { aggregationResponseSchema } from "@mikoshi-tracker/contracts/aggregations";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import { getAggregationsHandler } from "./aggregation.controller";

// Documentation-safe query schema — strips the z.coerce.number() transform on
// limit so z.toJSONSchema() succeeds. Runtime parsing still uses the contract.
const aggregationFiltersDocSchema = z.object({
  entryTypeSlug: z.string(),
  entryId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(["day", "week", "month", "none"]).optional(),
  fields: z.string().optional(),
  include: z.string().optional(),
  groupByPayload: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

const aggregationBadRequestDoc = {
  description: "Invalid filter parameters or unknown entryTypeSlug.",
  schema: z.object({ code: z.literal("BAD_REQUEST"), message: z.string() }),
} as const;

export const aggregationApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "GET",
    path: "/api/aggregations",
    operationId: "getAggregations",
    summary: "Get aggregations",
    description:
      "Runs a declarative aggregation query over events for the given entry type. " +
      "Returns bucketed sums, counts, and optional missing-day markers. " +
      "The fields parameter is a comma-separated list of payload field names to sum (e.g. 'kcal,protein_g'). " +
      "The include parameter accepts 'missing_days' and/or 'count'. " +
      "weeklyAverage is null when groupBy is 'none' or the date range spans less than seven days. " +
      "When groupByPayload is set the response groups by `LOWER(json_extract(payload, '$.<field>'))` " +
      "instead of date bucket; bucket.key.kind becomes 'payload' and weeklyAverage is null. " +
      "Use limit to bound the number of payload-grouped buckets (default 25, max 1000).",
    tags: ["Aggregations"],
    security: [{ BearerAuth: [] }],
    request: {
      query: aggregationFiltersDocSchema,
    },
    responses: {
      200: {
        description: "Bucketed aggregation results with totals and optional weekly average.",
        schema: aggregationResponseSchema,
        examples: {
          dailyFood: {
            summary: "Daily kcal aggregation for food_meal",
            value: {
              buckets: [
                {
                  key: { kind: "date", value: "2026-05-22" },
                  sum: { kcal: 1850, protein_g: 120 },
                  count: 3,
                  missing: false,
                },
                {
                  key: { kind: "date", value: "2026-05-21" },
                  sum: { kcal: 0, protein_g: 0 },
                  count: 0,
                  missing: true,
                },
              ],
              total: { sum: { kcal: 1850, protein_g: 120 }, count: 3 },
              weeklyAverage: { sum: { kcal: 264, protein_g: 17 }, count: 0 },
            },
          },
          repeatedMeals: {
            summary: "Top repeated food meals by name in last 30 days",
            value: {
              buckets: [
                {
                  key: { kind: "payload", field: "name", value: "oatmeal", sample: { name: "Oatmeal", kcal: 320 } },
                  sum: { kcal: 1920 },
                  count: 6,
                  missing: false,
                },
              ],
              total: { sum: { kcal: 1920 }, count: 6 },
              weeklyAverage: null,
            },
          },
        },
      },
      400: aggregationBadRequestDoc,
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerAggregationRoutes(app: FastifyInstance) {
  app.get("/api/aggregations", getAggregationsHandler);
}
