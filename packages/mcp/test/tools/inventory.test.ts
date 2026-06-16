import { describe, expect, it } from "vitest";

import { EXPECTED_TOOL_NAMES, toolInventory } from "../../src/tools/inventory";

describe("toolInventory", () => {
  it("covers every promised habits, today, and stats tool", () => {
    expect(toolInventory.map((tool) => tool.name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("keeps one primary route mapping per public tool", () => {
    expect(
      toolInventory.map((tool) => ({
        name: tool.name,
        route: `${tool.method} ${tool.path}`,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "habits_list",
          "route": "GET /habits",
        },
        {
          "name": "habits_add",
          "route": "POST /habits",
        },
        {
          "name": "habits_get_detail",
          "route": "GET /habits/:habitId",
        },
        {
          "name": "habits_edit",
          "route": "PATCH /habits/:habitId",
        },
        {
          "name": "habits_archive",
          "route": "POST /habits/:habitId/archive",
        },
        {
          "name": "habits_restore",
          "route": "POST /habits/:habitId/restore",
        },
        {
          "name": "today_get_summary",
          "route": "GET /today",
        },
        {
          "name": "today_complete",
          "route": "POST /today/complete",
        },
        {
          "name": "today_set_total",
          "route": "POST /today/set-total",
        },
        {
          "name": "today_undo",
          "route": "POST /today/undo",
        },
        {
          "name": "stats_get_overview",
          "route": "GET /stats/overview",
        },
        {
          "name": "attachment_upload",
          "route": "POST /attachments/base64",
        },
        {
          "name": "attachment_list",
          "route": "GET /attachments",
        },
        {
          "name": "attachment_get",
          "route": "GET /attachments/:id/file",
        },
        {
          "name": "entry_types_list",
          "route": "GET /entry-types",
        },
        {
          "name": "entry_types_get",
          "route": "GET /entry-types/:slug",
        },
        {
          "name": "entries_list",
          "route": "GET /entries",
        },
        {
          "name": "entries_create",
          "route": "POST /entries",
        },
        {
          "name": "entries_get",
          "route": "GET /entries/:id",
        },
        {
          "name": "entries_update",
          "route": "PATCH /entries/:id",
        },
        {
          "name": "entries_archive",
          "route": "POST /entries/:id/archive",
        },
        {
          "name": "entries_restore",
          "route": "POST /entries/:id/restore",
        },
        {
          "name": "entries_add_event",
          "route": "POST /entries/:id/events",
        },
        {
          "name": "events_list",
          "route": "GET /events",
        },
        {
          "name": "events_get",
          "route": "GET /events/:eventId",
        },
        {
          "name": "events_update",
          "route": "PATCH /events/:eventId",
        },
        {
          "name": "events_delete",
          "route": "DELETE /events/:eventId",
        },
        {
          "name": "events_undo",
          "route": "POST /events/:eventId/undo",
        },
        {
          "name": "aggregations_query",
          "route": "GET /aggregations",
        },
        {
          "name": "food_log_text",
          "route": "POST /skills/run",
        },
        {
          "name": "food_log_image",
          "route": "POST /skills/run",
        },
        {
          "name": "food_search",
          "route": "GET /v1/food/search",
        },
        {
          "name": "food_relog",
          "route": "POST /v1/food/relog",
        },
        {
          "name": "diet_get_goal",
          "route": "GET /v1/diet/goal",
        },
        {
          "name": "diet_set_goal",
          "route": "POST /v1/diet/goal",
        },
        {
          "name": "diet_get_preferences",
          "route": "GET /v1/diet/preferences",
        },
        {
          "name": "diet_set_preferences",
          "route": "POST /v1/diet/preferences",
        },
      ]
    `);
  });
});
