import { aggregationFiltersSchema, aggregationResponseSchema } from "../contracts/aggregations.js";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

export const aggregationsTools: InventoryTool[] = [
  {
    name: "aggregations_query",
    method: "GET",
    path: "/aggregations",
    description:
      "Run a declarative aggregation over entry events, supporting sum, count, completion-rate, streak, and missing-days broken down by day, week, month, or total.",
    inputSchema: aggregationFiltersSchema,
    responseSchema: aggregationResponseSchema,
    outputSchema: aggregationResponseSchema,
    adapter: "passthrough",
  },
];

export function createAggregationsReadOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    aggregations_query: async (input: unknown) => {
      const parsed = aggregationFiltersSchema.parse(input);
      const params = new URLSearchParams();

      params.set("entryTypeSlug", parsed.entryTypeSlug);
      params.set("from", parsed.from);
      params.set("to", parsed.to);
      params.set("groupBy", parsed.groupBy);
      if (parsed.entryId !== undefined) params.set("entryId", parsed.entryId);
      if (parsed.fields !== undefined) params.set("fields", parsed.fields);
      if (parsed.include !== undefined) params.set("include", parsed.include);

      const payload = aggregationResponseSchema.parse(
        await client.request(`/aggregations?${params.toString()}`),
      );

      const { total, weeklyAverage } = payload;
      const countSummary = `${total.count} event(s)`;
      const sumKeys = Object.keys(total.sum);
      const sumSummary = sumKeys.length > 0
        ? `; sums: ${sumKeys.map((k) => `${k}=${total.sum[k]}`).join(", ")}`
        : "";
      const weekSummary = weeklyAverage
        ? `; weekly avg count ${weeklyAverage.count}`
        : "";

      return {
        payload,
        summary: `Aggregation for ${parsed.entryTypeSlug} (${parsed.from} → ${parsed.to}): ${countSummary}${sumSummary}${weekSummary}.`,
      };
    },
  };
}
