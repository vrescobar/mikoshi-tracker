import { z } from "zod";
import type { FastifyInstance } from "fastify";

import {
  commonAuthErrorResponses,
  commonNotFoundResponse,
} from "@mikoshi-tracker/contracts/api";
import {
  aggregationFiltersSchema,
  aggregationResponseSchema,
} from "@mikoshi-tracker/contracts/aggregations";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import { getAggregationsHandler } from "./aggregation.controller";

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
      "weeklyAverage is null when groupBy is 'none' or the date range spans less than seven days.",
    tags: ["Aggregations"],
    security: [{ BearerAuth: [] }],
    request: {
      query: aggregationFiltersSchema,
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
                { key: "2026-05-22", sum: { kcal: 1850, protein_g: 120 }, count: 3, missing: false },
                { key: "2026-05-21", sum: { kcal: 0, protein_g: 0 }, count: 0, missing: true },
              ],
              total: { sum: { kcal: 1850, protein_g: 120 }, count: 3 },
              weeklyAverage: { sum: { kcal: 264, protein_g: 17 }, count: 0 },
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
