import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });

// ─── Domain shapes ────────────────────────────────────────────────────────────

export const entryCadenceSchema = z.enum(["recurring", "event_log"]);

/**
 * An EntryType record as returned by the API. payloadSchema, configSchema, and
 * aggregations are JSON objects (parsed from the DB strings) — their internal
 * structure is validated dynamically via the schema cache, not statically here.
 */
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

// ─── Path param schemas ───────────────────────────────────────────────────────

export const entryTypeSlugParamsSchema = z.object({
  slug: nonEmptyString,
});

// ─── Response schemas ─────────────────────────────────────────────────────────

export const entryTypeListResponseSchema = z.object({
  items: z.array(entryTypeRecordSchema),
});

export const entryTypeItemResponseSchema = z.object({
  item: entryTypeRecordSchema,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type EntryCadence = z.infer<typeof entryCadenceSchema>;
export type EntryTypeRecord = z.infer<typeof entryTypeRecordSchema>;
export type EntryTypeSlugParams = z.infer<typeof entryTypeSlugParamsSchema>;
export type EntryTypeListResponse = z.infer<typeof entryTypeListResponseSchema>;
export type EntryTypeItemResponse = z.infer<typeof entryTypeItemResponseSchema>;
