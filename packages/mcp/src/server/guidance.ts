import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const MIKOSHI_TRACKER_WORKFLOW_RESOURCE = {
  name: "mikoshi_tracker_workflow_guide",
  uri: "mikoshi-tracker://guides/workflow",
  title: "MikoshiTracker Workflow Guide",
  description:
    "Read-only playbook for choosing MikoshiTracker MCP tools, sequencing reads before writes, and avoiding ambiguous mutations.",
  mimeType: "text/markdown",
} as const;

export const MIKOSHI_TRACKER_WORKFLOW_PROMPT = {
  name: "mikoshi_tracker_assistant_workflow",
  title: "MikoshiTracker Assistant Workflow",
  description:
    "Prompt template for habit and today requests. Use it to decide whether to inspect, update, undo, or analyze through the MikoshiTracker MCP tools.",
} as const;

export const WORKFLOW_GUIDE_TEXT = `# MikoshiTracker MCP workflow guide

Use this playbook when deciding which MikoshiTracker MCP tool to call.

## Core rules

1. Default to read-first. If the user is asking what is due, what changed, or how things are going, inspect state before mutating it.
2. Default to \`today_get_summary\` for anything about today's checklist, remaining work, or whether the day is complete.
3. Only write when the user clearly asks for a change. If a target habit is ambiguous, resolve the ambiguity before calling a mutation tool.
4. After any successful write, summarize the result in natural language and mention the refreshed today state when relevant.

## Tool selection

- \`today_get_summary\`: Use first for "what should I do today", "what is left", or "am I done today?".
- \`today_complete\`: Use only for a boolean habit the user explicitly wants to check off today.
- \`today_set_total\`: Use when the user gives a numeric amount for today's quantified habit progress.
- \`today_undo\`: Use only when the user explicitly asks to undo or revert today's latest mutation.
- \`habits_list\`: Use to find a habit by name/category/status before editing or archiving.
- \`habits_get_detail\`: Use before non-trivial edits when you need the current config, streaks, or history.
- \`habits_add\`: Use when the user wants to create a new habit definition.
- \`habits_edit\`: Use to change an existing habit's settings after you have identified the right habit.
- \`habits_archive\` / \`habits_restore\`: Use only when the user explicitly wants to shelve or bring back a habit.
- \`stats_get_overview\`: Use for progress reviews, performance summaries, or trend questions.

## Canonical workflows

### Today triage

1. Call \`today_get_summary\`.
2. Summarize pending vs completed items.
3. Offer the next useful action only after you know the current state.

### Complete or update progress

1. If needed, call \`today_get_summary\` to resolve the habit name and kind.
2. For boolean habits, call \`today_complete\`.
3. For quantified habits, call \`today_set_total\` with the new total.
4. Summarize the affected habit and the refreshed day snapshot.

### Reconfigure a habit

1. Call \`habits_list\` to find the target habit when the name may not be unique.
2. Call \`habits_get_detail\` before large edits.
3. Call \`habits_edit\`, \`habits_archive\`, or \`habits_restore\` only after the target is clear.

### Review performance

1. Call \`stats_get_overview\` for high-level health.
2. Optionally follow with \`today_get_summary\` if the user also wants today's concrete next steps.
`;

export type GuidancePromptDefinition = typeof MIKOSHI_TRACKER_WORKFLOW_PROMPT;
export type GuidanceResourceDefinition = typeof MIKOSHI_TRACKER_WORKFLOW_RESOURCE;

export function registerGuidance(server: McpServer): {
  prompts: GuidancePromptDefinition[];
  resources: GuidanceResourceDefinition[];
} {
  server.registerPrompt(
    MIKOSHI_TRACKER_WORKFLOW_PROMPT.name,
    {
      title: MIKOSHI_TRACKER_WORKFLOW_PROMPT.title,
      description: MIKOSHI_TRACKER_WORKFLOW_PROMPT.description,
      argsSchema: {
        userRequest: z
          .string()
          .describe("The user's latest request about today's habits, progress, or habit settings."),
      },
    },
    async ({ userRequest }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: createWorkflowPrompt(userRequest),
          },
        },
      ],
    }),
  );

  server.registerResource(
    MIKOSHI_TRACKER_WORKFLOW_RESOURCE.name,
    MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri,
    {
      title: MIKOSHI_TRACKER_WORKFLOW_RESOURCE.title,
      description: MIKOSHI_TRACKER_WORKFLOW_RESOURCE.description,
      mimeType: MIKOSHI_TRACKER_WORKFLOW_RESOURCE.mimeType,
    },
    async () => ({
      contents: [
        {
          uri: MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri,
          text: WORKFLOW_GUIDE_TEXT,
        },
      ],
    }),
  );

  return {
    prompts: [MIKOSHI_TRACKER_WORKFLOW_PROMPT],
    resources: [MIKOSHI_TRACKER_WORKFLOW_RESOURCE],
  };
}

function createWorkflowPrompt(userRequest: string) {
  return [
    "You are handling a MikoshiTracker request through MCP tools.",
    "Follow the workflow guide below.",
    "",
    WORKFLOW_GUIDE_TEXT,
    "",
    "## Current user request",
    userRequest,
    "",
    "Respond by choosing the smallest safe tool sequence, preferring reads before writes and clarifying ambiguous mutation targets.",
  ].join("\n");
}
