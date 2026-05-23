import { z } from "zod";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

// Phase 13 G-MCP-1: end-to-end "log a meal" convenience tools that bounce
// through the tracker's /api/skills/run bridge to the Mikoshi food skill.
// Agents call these directly instead of composing entries.list + events.create
// manually.

const foodLogTextInputSchema = z.object({
  text: z.string().trim().min(1),
});

const foodLogImageInputSchema = z.object({
  imageBase64: z.string().trim().min(1),
});

const foodLogResponseSchema = z
  .object({
    action: z
      .enum(["auto_posted", "pending_confirmation", "needs_enrolment", "error"])
      .optional(),
  })
  .passthrough();

export const foodTools: InventoryTool[] = [
  {
    name: "food_log_text",
    method: "POST",
    path: "/skills/run",
    description:
      "Log a meal from a free-text description (e.g. 'tuna salad with two slices of bread') via the Mikoshi food skill. Returns the skill's stdout: 'auto_posted' carries the saved event, 'pending_confirmation' carries an editable proposal, 'needs_enrolment' means the skill is not configured yet.",
    inputSchema: foodLogTextInputSchema,
    responseSchema: foodLogResponseSchema,
    outputSchema: foodLogResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "food_log_image",
    method: "POST",
    path: "/skills/run",
    description:
      "Log a meal from a base64-encoded photo via the Mikoshi food skill. Same response shape as food_log_text.",
    inputSchema: foodLogImageInputSchema,
    responseSchema: foodLogResponseSchema,
    outputSchema: foodLogResponseSchema,
    adapter: "passthrough",
  },
];

export function createFoodWriteOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    food_log_text: async (input: unknown) => {
      const parsed = foodLogTextInputSchema.parse(input);
      const payload = foodLogResponseSchema.parse(
        await client.request("/skills/run", {
          method: "POST",
          body: JSON.stringify({
            skillSlug: "mikoshi-tracker-food",
            input: { tool: "food_log_from_input", text: parsed.text },
          }),
        }),
      );
      const action = typeof payload.action === "string" ? payload.action : "unknown";
      return {
        payload,
        summary: `Food skill ran on text input (${action}).`,
      };
    },
    food_log_image: async (input: unknown) => {
      const parsed = foodLogImageInputSchema.parse(input);
      const payload = foodLogResponseSchema.parse(
        await client.request("/skills/run", {
          method: "POST",
          body: JSON.stringify({
            skillSlug: "mikoshi-tracker-food",
            input: { tool: "food_log_from_input", imageBase64: parsed.imageBase64 },
          }),
        }),
      );
      const action = typeof payload.action === "string" ? payload.action : "unknown";
      return {
        payload,
        summary: `Food skill ran on image input (${action}).`,
      };
    },
  };
}
