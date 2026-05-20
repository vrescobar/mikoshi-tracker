import type { z } from "zod";

import { attachmentsTools } from "./attachments.js";
import { habitsTools } from "./habits.js";
import { statsTools } from "./stats.js";
import { todayTools } from "./today.js";

export type ToolAdapter = "passthrough" | "summary_to_today" | "overview_to_stats" | "action_to_today";

export type InventoryTool = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  description: string;
  inputSchema?: z.ZodTypeAny;
  /** Absent for tools that return binary content instead of JSON. */
  responseSchema?: z.ZodTypeAny;
  /** Absent for binary tools — they declare no structured output schema. */
  outputSchema?: z.ZodTypeAny;
  adapter: ToolAdapter;
  /** When true, the tool returns image content rather than structured JSON. */
  binary?: boolean;
};

export const toolInventory: InventoryTool[] = [...habitsTools, ...todayTools, ...statsTools, ...attachmentsTools];

export const EXPECTED_TOOL_NAMES = toolInventory.map((tool) => tool.name);
