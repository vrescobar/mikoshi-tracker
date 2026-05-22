import { z } from "zod";

import { attachmentMetadataSchema } from "./attachments.js";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalNonEmptyString = z.string().trim().min(1).optional();

export const eventMutationTypeSchema = z.enum(["CREATE", "UPDATE", "DELETE", "UNDO"]);
export const eventSourceSchema = z.enum(["WEB", "AI", "SYSTEM", "CIRCLE"]);

export const eventMutationRecordSchema = z.object({
  id: nonEmptyString,
  entryId: nonEmptyString,
  eventId: nonEmptyString.nullable(),
  userId: nonEmptyString,
  dateKey: isoDateSchema,
  type: eventMutationTypeSchema,
  source: eventSourceSchema,
  note: z.string().nullable(),
  previousPayload: z.unknown(),
  nextPayload: z.unknown(),
  createdAt: isoDateTimeSchema,
  attachments: z.array(attachmentMetadataSchema),
});

export const entryEventRecordSchema = z.object({
  id: nonEmptyString,
  entryId: nonEmptyString,
  userId: nonEmptyString,
  occurredAt: isoDateTimeSchema,
  dateKey: isoDateSchema,
  payload: z.unknown(),
  value: z.number().nullable(),
  completed: z.boolean().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const entryEventDetailSchema = entryEventRecordSchema.extend({
  mutations: z.array(eventMutationRecordSchema),
  attachments: z.array(attachmentMetadataSchema),
});

export const eventIdParamsSchema = z.object({
  eventId: nonEmptyString,
});

export const eventListFiltersSchema = z
  .object({
    entryId: optionalNonEmptyString,
    entryTypeSlug: optionalNonEmptyString,
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    limit: z.number().int().positive().optional(),
    cursor: optionalNonEmptyString,
  })
  .default({});

export const updateEventInputSchema = z
  .strictObject({
    payload: z.unknown().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => v.payload !== undefined || v.note !== undefined, {
    message: "At least one of payload or note must be provided",
  });

export const eventListResponseSchema = z.object({
  items: z.array(entryEventRecordSchema),
  cursor: nonEmptyString.nullable(),
  hasMore: z.boolean(),
});

export const eventItemResponseSchema = z.object({
  item: entryEventDetailSchema,
});

export const eventDeleteResponseSchema = z.object({
  eventId: nonEmptyString,
  mutationId: nonEmptyString,
});

export type EntryEventRecord = z.infer<typeof entryEventRecordSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type EventItemResponse = z.infer<typeof eventItemResponseSchema>;
export type EventDeleteResponse = z.infer<typeof eventDeleteResponseSchema>;
