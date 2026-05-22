import {
  entryTypeItemResponseSchema,
  entryTypeListResponseSchema,
  entryTypeSlugParamsSchema,
} from "../contracts/entry-types.js";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

export const entryTypesTools: InventoryTool[] = [
  {
    name: "entry_types_list",
    method: "GET",
    path: "/entry-types",
    description:
      "List all active entry types (habit_boolean, habit_quantity, food_meal, and any custom types) with their schemas and cadence.",
    responseSchema: entryTypeListResponseSchema,
    outputSchema: entryTypeListResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entry_types_get",
    method: "GET",
    path: "/entry-types/:slug",
    description:
      "Read one entry type's full schema, configuration descriptor, and aggregation spec by its slug.",
    inputSchema: entryTypeSlugParamsSchema,
    responseSchema: entryTypeItemResponseSchema,
    outputSchema: entryTypeItemResponseSchema,
    adapter: "passthrough",
  },
];

export function createEntryTypesReadOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    entry_types_list: async () => {
      const payload = entryTypeListResponseSchema.parse(await client.request("/entry-types"));

      return {
        payload,
        summary:
          payload.items.length === 0
            ? "No active entry types found."
            : `${payload.items.length} entry type(s): ${payload.items.map((t) => t.slug).join(", ")}.`,
      };
    },
    entry_types_get: async (input: unknown) => {
      const parsed = entryTypeSlugParamsSchema.parse(input);
      const payload = entryTypeItemResponseSchema.parse(
        await client.request(`/entry-types/${encodeURIComponent(parsed.slug)}`),
      );

      return {
        payload,
        summary: `Entry type ${payload.item.slug}: ${payload.item.displayName} (${payload.item.cadence}).`,
      };
    },
  };
}
