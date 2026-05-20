import { Buffer } from "node:buffer";

import {
  attachmentGetInputSchema,
  attachmentListInputSchema,
  attachmentListResponseSchema,
  attachmentUploadInputSchema,
  attachmentUploadResponseSchema,
  type AttachmentListResponse,
} from "../contracts/attachments.js";

import type { HaaabitApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

export const attachmentsTools: InventoryTool[] = [
  {
    name: "attachment_upload",
    method: "POST",
    path: "/attachments/base64",
    description:
      "Attach an image to a check-in entry when the user shares a photo for a habit (a meal photo, proof a chore is done, etc.). Pass the mutationId returned by a today_* action and the image as base64.",
    inputSchema: attachmentUploadInputSchema,
    responseSchema: attachmentUploadResponseSchema,
    outputSchema: attachmentUploadResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "attachment_list",
    method: "GET",
    path: "/attachments",
    description:
      "List the image attachments of a check-in entry (mutationId) or of an entire habit (habitId), returning each attachment id and its metadata.",
    inputSchema: attachmentListInputSchema,
    responseSchema: attachmentListResponseSchema,
    outputSchema: attachmentListResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "attachment_get",
    method: "GET",
    path: "/attachments/:id/file",
    description:
      "Fetch a stored attachment image by id and return it as an image so you can see and reason about the photo (e.g. estimate calories from a meal photo).",
    inputSchema: attachmentGetInputSchema,
    adapter: "passthrough",
    binary: true,
  },
];

function summarizeList(payload: AttachmentListResponse): string {
  if (payload.attachments.length === 0) {
    return "No attachments found.";
  }

  return `${payload.attachments.length} attachment(s); ${payload.remaining} more slot(s) free on this entry.`;
}

export function createAttachmentReadOperations(client: HaaabitApiClient): Record<string, ToolOperation> {
  return {
    attachment_list: async (input: unknown) => {
      const parsed = attachmentListInputSchema.parse(input ?? {});
      const query = new URLSearchParams();
      if (parsed.mutationId) {
        query.set("mutationId", parsed.mutationId);
      }
      if (parsed.habitId) {
        query.set("habitId", parsed.habitId);
      }
      const payload = attachmentListResponseSchema.parse(await client.request(`/attachments?${query.toString()}`));

      return {
        payload,
        summary: summarizeList(payload),
      };
    },
    attachment_get: async (input: unknown) => {
      const parsed = attachmentGetInputSchema.parse(input);
      const query = parsed.width ? `?w=${parsed.width}` : "";
      const { bytes, mimeType } = await client.requestBinary(
        `/attachments/${encodeURIComponent(parsed.id)}/file${query}`,
      );

      return {
        image: {
          base64: Buffer.from(bytes).toString("base64"),
          mimeType,
        },
        summary: `Loaded attachment ${parsed.id} (${mimeType}, ${bytes.length} bytes).`,
        metadata: {
          id: parsed.id,
          mimeType,
          byteLength: bytes.length,
        },
      };
    },
  };
}

export function createAttachmentWriteOperations(client: HaaabitApiClient): Record<string, ToolOperation> {
  return {
    attachment_upload: async (input: unknown) => {
      const parsed = attachmentUploadInputSchema.parse(input);
      const payload = attachmentUploadResponseSchema.parse(
        await client.request("/attachments/base64", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(parsed),
        }),
      );

      return {
        payload,
        summary: `Attached image to check-in entry ${payload.attachment.mutationId}.`,
      };
    },
  };
}
