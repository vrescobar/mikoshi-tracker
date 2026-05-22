import {
  createEntryEventInputSchema,
  createEntryInputSchema,
  entryIdParamsSchema,
  entryItemResponseSchema,
  entryListFiltersSchema,
  entryListResponseSchema,
  updateEntryInputSchema,
} from "../contracts/entries.js";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

export const entriesTools: InventoryTool[] = [
  {
    name: "entries_list",
    method: "GET",
    path: "/entries",
    description:
      "List the user's entries filtered by entry type, active status, or name query.",
    inputSchema: entryListFiltersSchema,
    responseSchema: entryListResponseSchema,
    outputSchema: entryListResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_create",
    method: "POST",
    path: "/entries",
    description:
      "Create a new entry for a given entry type, with config validated against the type's configSchema.",
    inputSchema: createEntryInputSchema,
    responseSchema: entryItemResponseSchema,
    outputSchema: entryItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_get",
    method: "GET",
    path: "/entries/:id",
    description:
      "Read one entry's full configuration and metadata by its id.",
    inputSchema: entryIdParamsSchema,
    responseSchema: entryItemResponseSchema,
    outputSchema: entryItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_update",
    method: "PATCH",
    path: "/entries/:id",
    description:
      "Update an entry's name, description, category, or config.",
    inputSchema: updateEntryInputSchema,
    responseSchema: entryItemResponseSchema,
    outputSchema: entryItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_archive",
    method: "POST",
    path: "/entries/:id/archive",
    description:
      "Archive an entry, making it read-only and hiding it from active lists.",
    inputSchema: entryIdParamsSchema,
    responseSchema: entryItemResponseSchema,
    outputSchema: entryItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_restore",
    method: "POST",
    path: "/entries/:id/restore",
    description:
      "Restore an archived entry, making it active again.",
    inputSchema: entryIdParamsSchema,
    responseSchema: entryItemResponseSchema,
    outputSchema: entryItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "entries_add_event",
    method: "POST",
    path: "/entries/:id/events",
    description:
      "Record a new event for an entry, with payload validated against the entry type's payloadSchema.",
    inputSchema: createEntryEventInputSchema,
    adapter: "passthrough",
  },
];

export function createEntriesReadOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    entries_list: async (input: unknown) => {
      const parsed = entryListFiltersSchema.parse(input ?? {});
      const params = new URLSearchParams();

      if (parsed.entryTypeSlug !== undefined) params.set("entryTypeSlug", parsed.entryTypeSlug);
      if (parsed.isActive !== undefined) params.set("isActive", String(parsed.isActive));
      if (parsed.query !== undefined) params.set("query", parsed.query);

      const payload = entryListResponseSchema.parse(
        await client.request(`/entries?${params.toString()}`),
      );

      return {
        payload,
        summary:
          payload.items.length === 0
            ? "No entries matched the requested filters."
            : `${payload.items.length} entry(ies): ${payload.items.map((e) => e.name).join(", ")}.`,
      };
    },
    entries_get: async (input: unknown) => {
      const parsed = entryIdParamsSchema.parse(input);
      const payload = entryItemResponseSchema.parse(
        await client.request(`/entries/${encodeURIComponent(parsed.id)}`),
      );

      return {
        payload,
        summary: `Entry ${payload.item.name} (${payload.item.entryTypeSlug}, ${payload.item.isActive ? "active" : "archived"}).`,
      };
    },
  };
}

export function createEntriesWriteOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    entries_create: async (input: unknown) => {
      const parsed = createEntryInputSchema.parse(input);
      const payload = entryItemResponseSchema.parse(
        await client.request("/entries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        }),
      );

      return {
        payload,
        summary: `Created entry ${payload.item.name} (${payload.item.entryTypeSlug}).`,
      };
    },
    entries_update: async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const id = String(raw.id ?? "");
      const parsed = updateEntryInputSchema.parse(raw);
      const payload = entryItemResponseSchema.parse(
        await client.request(`/entries/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        }),
      );

      return {
        payload,
        summary: `Updated entry ${payload.item.name}.`,
      };
    },
    entries_archive: async (input: unknown) => {
      const parsed = entryIdParamsSchema.parse(input);
      const payload = entryItemResponseSchema.parse(
        await client.request(`/entries/${encodeURIComponent(parsed.id)}/archive`, {
          method: "POST",
        }),
      );

      return {
        payload,
        summary: `Archived ${payload.item.name}. Archived entries are read-only.`,
      };
    },
    entries_restore: async (input: unknown) => {
      const parsed = entryIdParamsSchema.parse(input);
      const payload = entryItemResponseSchema.parse(
        await client.request(`/entries/${encodeURIComponent(parsed.id)}/restore`, {
          method: "POST",
        }),
      );

      return {
        payload,
        summary: `Restored ${payload.item.name}. This entry is active again.`,
      };
    },
    entries_add_event: async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const id = String(raw.id ?? "");
      const { id: _id, ...body } = raw;

      await client.request(`/entries/${encodeURIComponent(id)}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      return {
        payload: { entryId: id },
        summary: `Recorded event for entry ${id}.`,
      };
    },
  };
}
