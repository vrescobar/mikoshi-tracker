import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalNonEmptyString = z.string().trim().min(1).optional();
const nullableOptionalNonEmptyString = z.string().trim().min(1).nullable().optional();

export const eventSourceSchema = z.enum(["WEB", "AI", "SYSTEM", "CIRCLE"]);

export const entryRecordSchema = z.object({
  id: nonEmptyString,
  userId: nonEmptyString,
  entryTypeId: nonEmptyString,
  entryTypeSlug: nonEmptyString,
  name: nonEmptyString,
  description: z.string().nullable(),
  category: z.string().nullable(),
  config: z.unknown(),
  startDate: isoDateSchema,
  isActive: z.boolean(),
  weekdays: z.array(nonEmptyString),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const entryIdParamsSchema = z.object({
  id: nonEmptyString,
});

export const entryListFiltersSchema = z
  .object({
    entryTypeSlug: optionalNonEmptyString,
    isActive: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((v) => (typeof v === "string" ? v === "true" : v))
      .optional(),
    query: optionalNonEmptyString,
  })
  .default({});

export const createEntryInputSchema = z.object({
  entryTypeSlug: nonEmptyString,
  name: nonEmptyString,
  description: optionalNonEmptyString,
  category: optionalNonEmptyString,
  config: z.unknown(),
  startDate: isoDateSchema.optional(),
  weekdays: z.array(nonEmptyString).optional(),
});

export const updateEntryInputSchema = z
  .strictObject({
    name: optionalNonEmptyString,
    description: nullableOptionalNonEmptyString,
    category: nullableOptionalNonEmptyString,
    config: z.unknown().optional(),
  })
  .refine((v) => Object.values(v).some((val) => val !== undefined), {
    message: "At least one editable entry field must be provided",
  });

export const createEntryEventInputSchema = z.object({
  id: nonEmptyString,
  occurredAt: isoDateTimeSchema,
  payload: z.unknown(),
  attachmentIds: z.array(nonEmptyString).optional(),
  source: eventSourceSchema.default("WEB"),
  note: z.string().trim().min(1).nullable().optional(),
});

export const entryListResponseSchema = z.object({
  items: z.array(entryRecordSchema),
});

export const entryItemResponseSchema = z.object({
  item: entryRecordSchema,
});

export type EntryRecord = z.infer<typeof entryRecordSchema>;
export type EntryListResponse = z.infer<typeof entryListResponseSchema>;
export type EntryItemResponse = z.infer<typeof entryItemResponseSchema>;
