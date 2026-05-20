import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { adaptToolResult } from "../schemas/adapters.js";

const MACHINE_JSON_FIELD = "_mikoshi_tracker_json";

export function createReadToolResult(toolName: string, payload: unknown, summary: string): CallToolResult {
  return createSuccessToolResult(toolName, payload, summary);
}

export function createMutationToolResult(toolName: string, payload: unknown, summary: string): CallToolResult {
  return createSuccessToolResult(toolName, payload, summary);
}

/**
 * Build a tool result that carries an actual image so the model can see it.
 * The summary and JSON metadata accompany the image as text content blocks.
 */
export function createImageToolResult(
  image: { base64: string; mimeType: string },
  summary: string,
  metadata: Record<string, unknown>,
): CallToolResult {
  return {
    content: [
      { type: "text", text: summary },
      { type: "image", data: image.base64, mimeType: image.mimeType },
      { type: "text", text: JSON.stringify(metadata) },
    ],
  };
}

export function buildMachineReadableToolResult(
  summary: string,
  structuredContent: Record<string, unknown>,
  options: {
    isError?: boolean;
  } = {},
): CallToolResult {
  const serializedContent = serializeStructuredContent(structuredContent);

  return {
    content: [
      {
        type: "text",
        text: summary,
      },
      {
        type: "text",
        text: serializedContent,
      },
    ],
    ...(options.isError ? { isError: true } : {}),
    structuredContent: {
      ...structuredContent,
      [MACHINE_JSON_FIELD]: serializedContent,
    },
  };
}

function createSuccessToolResult(toolName: string, payload: unknown, summary: string): CallToolResult {
  const structuredContent = adaptToolResult(toolName, payload);

  if (!isRecord(structuredContent)) {
    throw new Error(`Expected object structuredContent for tool ${toolName}`);
  }

  return buildMachineReadableToolResult(summary, structuredContent);
}

export function formatNameList(names: string[], limit = 5) {
  if (names.length <= limit) {
    return names.join(", ");
  }

  const visible = names.slice(0, limit).join(", ");
  const remaining = names.length - limit;

  return `${visible}, +${remaining} more`;
}

function serializeStructuredContent(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
