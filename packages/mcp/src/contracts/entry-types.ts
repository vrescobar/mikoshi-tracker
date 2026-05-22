import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const entryCadenceSchema = z.enum(["recurring", "event_log"]);

export const entryTypeRecordSchema = z.object({
  id: nonEmptyString,
  slug: nonEmptyString,
  displayName: nonEmptyString,
  cadence: entryCadenceSchema,
  payloadSchema: z.unknown(),
  configSchema: z.unknown(),
  aggregations: z.unknown(),
  skillSlug: nonEmptyString.nullable(),
  isBuiltIn: z.boolean(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const entryTypeSlugParamsSchema = z.object({
  slug: nonEmptyString,
});

export const entryTypeListResponseSchema = z.object({
  items: z.array(entryTypeRecordSchema),
});

export const entryTypeItemResponseSchema = z.object({
  item: entryTypeRecordSchema,
});

export type EntryTypeRecord = z.infer<typeof entryTypeRecordSchema>;
export type EntryTypeListResponse = z.infer<typeof entryTypeListResponseSchema>;
export type EntryTypeItemResponse = z.infer<typeof entryTypeItemResponseSchema>;
