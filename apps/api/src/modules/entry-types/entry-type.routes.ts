import type { FastifyInstance } from "fastify";

import {
  commonAuthErrorResponses,
  commonNotFoundResponse,
} from "@mikoshi-tracker/contracts/api";
import {
  entryTypeItemResponseSchema,
  entryTypeListResponseSchema,
  entryTypeSlugParamsSchema,
} from "@mikoshi-tracker/contracts/entry-types";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import { getEntryTypeHandler, listEntryTypesHandler } from "./entry-type.controller";

export const entryTypeApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "GET",
    path: "/api/entry-types",
    operationId: "listEntryTypes",
    summary: "List entry types",
    description:
      "Returns all active entry types with their embedded JSON Schema definitions for payload and config. The three built-in types are habit_boolean, habit_quantity, and food_meal.",
    tags: ["EntryTypes"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "Active entry types.",
        schema: entryTypeListResponseSchema,
        examples: {
          list: {
            summary: "Built-in entry types",
            value: {
              items: [
                {
                  id: "entrytype_habit_boolean",
                  slug: "habit_boolean",
                  displayName: "Habit (boolean)",
                  cadence: "recurring",
                  payloadSchema: { type: "object", required: ["completed"], properties: { completed: { type: "boolean" } } },
                  configSchema: { type: "object", required: ["frequencyType"], properties: { frequencyType: { type: "string" } } },
                  aggregations: { sumFields: [], kinds: ["completion_rate", "streak"] },
                  skillSlug: null,
                  isBuiltIn: true,
                  isActive: true,
                  createdAt: "2026-05-21T18:11:00.000Z",
                  updatedAt: "2026-05-21T18:11:00.000Z",
                },
              ],
            },
          },
        },
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/entry-types/:slug",
    operationId: "getEntryType",
    summary: "Get entry type by slug",
    description: "Returns a single active entry type including its full payload and config JSON Schema definitions.",
    tags: ["EntryTypes"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryTypeSlugParamsSchema,
    },
    responses: {
      200: {
        description: "The requested entry type.",
        schema: entryTypeItemResponseSchema,
      },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerEntryTypeRoutes(app: FastifyInstance) {
  app.get("/api/entry-types", listEntryTypesHandler);
  app.get("/api/entry-types/:slug", getEntryTypeHandler);
}
