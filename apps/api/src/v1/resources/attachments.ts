import { z } from "zod";

import {
  attachmentEventUploadInputSchema,
  attachmentListFiltersSchema,
  attachmentListResponseSchema,
  attachmentMetadataSchema,
  attachmentUploadBase64InputSchema,
} from "@mikoshi-tracker/contracts/attachments";

import {
  type AttachmentDependencies,
  deleteAttachmentById,
  listAttachments,
  uploadAttachment,
} from "../../modules/attachments/attachment.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1Context, V1RouteMeta } from "../match";

const Attachment = registerSchema("Attachment", attachmentMetadataSchema);

const nonEmpty = z.string().trim().min(1);
const deleteInputSchema = z.object({ id: nonEmpty });

/** Attachment storage lives on disk; the dir comes from the server env, not deps. */
function attachmentDeps(ctx: V1Context): AttachmentDependencies {
  return { db: ctx.deps.sqlite, attachmentsDir: ctx.request.server.env.ATTACHMENTS_DIR };
}

/** Tolerate a data-URL prefix (data:image/png;base64,....). */
function decodeBase64(data: string): Buffer {
  const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  return Buffer.from(base64, "base64");
}

/**
 * Attachments in v1 cover only the JSON-RPC-friendly operations. Binary
 * multipart upload and raw file streaming stay on the legacy `/api/attachments`
 * surface — they cannot be modeled as typed JSON request/response and are a
 * permanent ratchet exclusion (see test/v1/contract.test.ts).
 */
export function attachmentsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "attachments",
      path: "/attachments",
      operationId: "attachmentsList",
      summary: "List attachment metadata for a mutation or habit",
      auth: "bearer",
      mutating: false,
      list: true,
      querySchema: attachmentListFiltersSchema,
      outputSchema: envelope(attachmentListResponseSchema),
      handler: (ctx) => {
        const query = ctx.query as z.infer<typeof attachmentListFiltersSchema>;
        return listAttachments(attachmentDeps(ctx), {
          userId: requireUserId(ctx),
          mutationId: query.mutationId,
          habitId: query.habitId,
        });
      },
    },
    {
      method: "POST",
      resource: "attachments",
      path: "/attachments/upload-base64",
      operationId: "attachmentUploadBase64",
      summary: "Upload an image (base64) pinned to a habit check-in mutation",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: attachmentUploadBase64InputSchema,
      outputSchema: envelope(Attachment),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof attachmentUploadBase64InputSchema>;
        return uploadAttachment(attachmentDeps(ctx), {
          userId: requireUserId(ctx),
          target: { mutationId: input.mutationId },
          buffer: decodeBase64(input.data),
          originalName: input.originalName ?? null,
        });
      },
    },
    {
      method: "POST",
      resource: "attachments",
      path: "/attachments/upload-event",
      operationId: "attachmentUploadEvent",
      summary: "Upload an image (base64) pinned to an entry event (food)",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: attachmentEventUploadInputSchema,
      outputSchema: envelope(Attachment),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof attachmentEventUploadInputSchema>;
        return uploadAttachment(attachmentDeps(ctx), {
          userId: requireUserId(ctx),
          target: { eventId: input.eventId },
          buffer: decodeBase64(input.data),
          originalName: input.originalName ?? null,
        });
      },
    },
    {
      method: "POST",
      resource: "attachments",
      path: "/attachments/delete",
      operationId: "attachmentDelete",
      summary: "Delete an attachment by id",
      auth: "bearer",
      mutating: true,
      inputSchema: deleteInputSchema,
      outputSchema: envelope(z.object({})),
      handler: async (ctx) => {
        await deleteAttachmentById(attachmentDeps(ctx), {
          userId: requireUserId(ctx),
          id: (ctx.input as z.infer<typeof deleteInputSchema>).id,
        });
        return {};
      },
    },
  ];
}
