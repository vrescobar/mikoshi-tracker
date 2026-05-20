import { z } from "zod";

// Mirror of @mikoshi-tracker/contracts/attachments — the MCP package keeps a local
// copy of every contract it depends on (see sibling files in this folder).

const nonEmptyString = z.string().trim().min(1);

export const MAX_ATTACHMENTS_PER_MUTATION = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_DIMENSION = 1024;

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

export const attachmentUploadInputSchema = z.object({
  mutationId: nonEmptyString,
  data: nonEmptyString,
  originalName: nonEmptyString.nullable().optional(),
});

export const attachmentListInputSchema = z
  .object({
    mutationId: nonEmptyString.optional(),
    habitId: nonEmptyString.optional(),
  })
  .refine((value) => Boolean(value.mutationId) || Boolean(value.habitId), {
    message: "Provide mutationId or habitId",
  });

export const attachmentGetInputSchema = z.object({
  id: nonEmptyString,
  width: z.number().int().positive().max(ATTACHMENT_MAX_DIMENSION).optional(),
});

export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>;
export type AttachmentUploadInput = z.infer<typeof attachmentUploadInputSchema>;
export type AttachmentListInput = z.infer<typeof attachmentListInputSchema>;
export type AttachmentGetInput = z.infer<typeof attachmentGetInputSchema>;
