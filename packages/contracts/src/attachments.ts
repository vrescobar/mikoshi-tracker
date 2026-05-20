import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

/** Maximum number of attachments allowed per check-in entry. */
export const MAX_ATTACHMENTS_PER_MUTATION = 10;
/** Maximum size, in bytes, accepted for a single uploaded file (pre-processing). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Longest-side pixel dimension stored attachments are downscaled to. */
export const ATTACHMENT_MAX_DIMENSION = 1024;

/** Generic on purpose: v1 only accepts images, but the table/contract can grow. */
export const attachmentKindSchema = z.enum(["image"]);

export const attachmentMetadataSchema = z.object({
  id: nonEmptyString,
  mutationId: nonEmptyString,
  kind: attachmentKindSchema,
  mimeType: nonEmptyString,
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  originalName: nonEmptyString.nullable(),
  createdAt: z.string(),
  /** Relative API path that streams the binary, e.g. /api/attachments/:id/file */
  url: nonEmptyString,
});

export const attachmentListResponseSchema = z.object({
  attachments: z.array(attachmentMetadataSchema),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});

export const attachmentUploadResponseSchema = z.object({
  attachment: attachmentMetadataSchema,
});

/** Used by MCP/OpenClaw agents that cannot send multipart form-data easily. */
export const attachmentUploadBase64InputSchema = z.object({
  mutationId: nonEmptyString,
  data: nonEmptyString,
  originalName: nonEmptyString.nullable().optional(),
});

export const attachmentListFiltersSchema = z
  .object({
    mutationId: nonEmptyString.optional(),
    habitId: nonEmptyString.optional(),
  })
  .refine((value) => Boolean(value.mutationId) || Boolean(value.habitId), {
    message: "Provide mutationId or habitId",
  });

export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>;
export type AttachmentUploadResponse = z.infer<typeof attachmentUploadResponseSchema>;
export type AttachmentUploadBase64Input = z.infer<typeof attachmentUploadBase64InputSchema>;
export type AttachmentListFilters = z.infer<typeof attachmentListFiltersSchema>;
