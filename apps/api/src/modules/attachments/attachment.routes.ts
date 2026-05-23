import { z } from "zod";
import type { FastifyInstance } from "fastify";

import {
  attachmentEventUploadInputSchema,
  attachmentListFiltersSchema,
  attachmentListResponseSchema,
  attachmentUploadBase64InputSchema,
  attachmentUploadResponseSchema,
} from "@mikoshi-tracker/contracts/attachments";
import { commonAuthErrorResponses } from "@mikoshi-tracker/contracts/api";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import {
  deleteAttachmentHandler,
  downloadAttachmentHandler,
  listAttachmentsHandler,
  uploadAttachmentBase64Handler,
  uploadAttachmentToEventHandler,
  uploadAttachmentsHandler,
} from "./attachment.controller";

/** Body limit for the base64 upload route: a 10 MB image is ~13.3 MB encoded. */
const BASE64_BODY_LIMIT = 20 * 1024 * 1024;

const attachmentIdParamsSchema = z.object({ id: z.string().trim().min(1) });

const attachmentErrorSchema = z.object({ code: z.string(), message: z.string() });

export const attachmentApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "POST",
    path: "/api/attachments/base64",
    operationId: "uploadAttachmentBase64",
    summary: "Upload attachment (base64)",
    description:
      "Upload a single image as a base64-encoded string. Useful for agents (MCP/OpenClaw) that cannot send multipart form-data. The `mutationId` must reference a `CheckInMutation` owned by the authenticated user.",
    tags: ["Attachments"],
    security: [{ BearerAuth: [] }],
    request: {
      body: attachmentUploadBase64InputSchema,
      bodyExamples: {
        png: {
          summary: "PNG image",
          value: {
            mutationId: "mut_abc123",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            originalName: "photo.png",
          },
        },
      },
    },
    responses: {
      200: {
        description: "Attachment processed and persisted.",
        schema: attachmentUploadResponseSchema,
        examples: {
          ok: {
            summary: "Successful upload",
            value: {
              attachment: {
                id: "att_xyz",
                mutationId: "mut_abc123",
                kind: "image",
                mimeType: "image/png",
                size: 4096,
                width: 512,
                height: 512,
                originalName: "photo.png",
                createdAt: "2026-01-01T00:00:00.000Z",
                url: "/api/attachments/att_xyz/file",
              },
            },
          },
        },
      },
      400: {
        description: "Missing or invalid request body.",
        schema: attachmentErrorSchema,
      },
      404: {
        description: "The referenced `mutationId` does not exist or does not belong to the authenticated user.",
        schema: attachmentErrorSchema,
      },
      409: {
        description: "The mutation already has the maximum number of attachments.",
        schema: attachmentErrorSchema,
      },
      413: {
        description: "The image data exceeds the maximum allowed size.",
        schema: attachmentErrorSchema,
      },
      415: {
        description: "The uploaded file is not a supported image type.",
        schema: attachmentErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/attachments/event",
    operationId: "uploadAttachmentToEvent",
    summary: "Upload attachment pinned to an EntryEvent",
    description:
      "Upload a single image as base64, anchored to an EntryEvent (used by the food " +
      "quick-add flow). The server resolves the event's latest CREATE/UPDATE mutation " +
      "and stores the file against it. The event must belong to the authenticated user.",
    tags: ["Attachments"],
    security: [{ BearerAuth: [] }],
    request: {
      body: attachmentEventUploadInputSchema,
      bodyExamples: {
        png: {
          summary: "PNG pinned to a food event",
          value: {
            eventId: "evt_abc123",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            originalName: "meal.png",
          },
        },
      },
    },
    responses: {
      201: {
        description: "Attachment processed and persisted.",
        schema: attachmentUploadResponseSchema,
      },
      400: {
        description: "Missing or invalid request body.",
        schema: attachmentErrorSchema,
      },
      404: {
        description: "The referenced `eventId` does not exist or does not belong to the authenticated user.",
        schema: attachmentErrorSchema,
      },
      409: {
        description: "The event's latest mutation already has the maximum number of attachments.",
        schema: attachmentErrorSchema,
      },
      413: {
        description: "The image data exceeds the maximum allowed size.",
        schema: attachmentErrorSchema,
      },
      415: {
        description: "The uploaded file is not a supported image type.",
        schema: attachmentErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/attachments",
    operationId: "listAttachments",
    summary: "List attachments",
    description:
      "Returns attachment metadata for a given `mutationId` or all mutations belonging to a `habitId`. Exactly one query parameter is required.",
    tags: ["Attachments"],
    security: [{ BearerAuth: [] }],
    request: {
      query: attachmentListFiltersSchema,
    },
    responses: {
      200: {
        description: "Attachment metadata list.",
        schema: attachmentListResponseSchema,
        examples: {
          ok: {
            summary: "Single attachment",
            value: {
              attachments: [
                {
                  id: "att_xyz",
                  mutationId: "mut_abc123",
                  kind: "image",
                  mimeType: "image/jpeg",
                  size: 8192,
                  width: 1024,
                  height: 768,
                  originalName: "walk.jpg",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  url: "/api/attachments/att_xyz/file",
                },
              ],
              limit: 50,
              remaining: 0,
            },
          },
        },
      },
      400: {
        description: "Neither `mutationId` nor `habitId` was provided.",
        schema: attachmentErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/attachments/:id/file",
    operationId: "downloadAttachmentFile",
    summary: "Download attachment file",
    description:
      "Streams the raw image binary for the attachment. Responds with the original MIME type. Supply `?w=<pixels>` to request a downscaled version (max 1024px on the longest side). The response carries `Cache-Control: immutable`.",
    tags: ["Attachments"],
    security: [{ BearerAuth: [] }],
    request: {
      params: attachmentIdParamsSchema,
    },
    responses: {
      200: {
        description: "Raw image binary (MIME type matches `attachment.mimeType`).",
        schema: z.object({ _note: z.literal("Binary stream — not JSON.") }),
      },
      404: {
        description: "Attachment not found or file missing from storage.",
        schema: attachmentErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "DELETE",
    path: "/api/attachments/:id",
    operationId: "deleteAttachment",
    summary: "Delete attachment",
    description: "Removes the attachment record and its stored file. The associated `CheckInMutation` is not modified.",
    tags: ["Attachments"],
    security: [{ BearerAuth: [] }],
    request: {
      params: attachmentIdParamsSchema,
    },
    responses: {
      204: {
        description: "Attachment deleted.",
        schema: z.object({}),
      },
      404: {
        description: "Attachment not found or does not belong to the authenticated user.",
        schema: attachmentErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerAttachmentRoutes(app: FastifyInstance) {
  app.post("/api/attachments", uploadAttachmentsHandler);
  app.post("/api/attachments/base64", { bodyLimit: BASE64_BODY_LIMIT }, uploadAttachmentBase64Handler);
  app.post("/api/attachments/event", { bodyLimit: BASE64_BODY_LIMIT }, uploadAttachmentToEventHandler);
  app.get("/api/attachments", listAttachmentsHandler);
  app.get("/api/attachments/:id/file", downloadAttachmentHandler);
  app.delete("/api/attachments/:id", deleteAttachmentHandler);
}
