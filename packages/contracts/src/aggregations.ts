import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const optionalNonEmptyString = z.string().trim().min(1).optional();

export const aggregationGroupBySchema = z.enum(["day", "week", "month", "none"]);

// ─── Input schemas ────────────────────────────────────────────────────────────

const payloadFieldSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "payload field must match [a-zA-Z][a-zA-Z0-9_]*");

export const aggregationFiltersSchema = z.object({
  entryTypeSlug: nonEmptyString,
  entryId: optionalNonEmptyString,
  from: isoDateSchema,
  to: isoDateSchema,
  groupBy: aggregationGroupBySchema.default("day"),
  /** Comma-separated field names, e.g. "kcal,protein_g". Omit for all fields. */
  fields: optionalNonEmptyString,
  /** Comma-separated extras: "missing_days", "count". */
  include: optionalNonEmptyString,
  /** When set, GROUP BY json_extract(payload, '$.<field>'). Mutually
   *  exclusive with date-bucket groupBy in the response shape. */
  groupByPayload: payloadFieldSchema.optional(),
  /** Hard cap on returned buckets when groupByPayload is in play. */
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

// ─── Domain shapes ────────────────────────────────────────────────────────────

/**
 * sum is keyed by field name (e.g. "kcal", "protein_g"). Values are numeric
 * aggregations over the requested period.
 */
export const aggregationSumSchema = z.record(z.string(), z.number());

export const aggregationDateBucketKeySchema = z.object({
  kind: z.literal("date"),
  /** YYYY-MM-DD for day, YYYY-Www for week, YYYY-MM for month, "total" for none. */
  value: nonEmptyString,
});

export const aggregationPayloadBucketKeySchema = z.object({
  kind: z.literal("payload"),
  field: nonEmptyString,
  value: z.string(),
  /** Optional sample payload from the last event in this bucket. Useful for
   *  "log again" affordances. */
  sample: z.unknown().optional(),
});

export const aggregationBucketKeySchema = z.discriminatedUnion("kind", [
  aggregationDateBucketKeySchema,
  aggregationPayloadBucketKeySchema,
]);

export const aggregationBucketSchema = z.object({
  key: aggregationBucketKeySchema,
  sum: aggregationSumSchema,
  count: z.number().int().nonnegative(),
  missing: z.boolean(),
});

export const aggregationSummarySchema = z.object({
  sum: aggregationSumSchema,
  count: z.number().int().nonnegative(),
});

// ─── Response schemas ─────────────────────────────────────────────────────────

export const aggregationResponseSchema = z.object({
  buckets: z.array(aggregationBucketSchema),
  total: aggregationSummarySchema,
  /** null when groupBy is "none" or the date range spans less than a week. */
  weeklyAverage: aggregationSummarySchema.nullable(),
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type AggregationGroupBy = z.infer<typeof aggregationGroupBySchema>;
export type AggregationFilters = z.infer<typeof aggregationFiltersSchema>;
export type AggregationSum = z.infer<typeof aggregationSumSchema>;
export type AggregationBucketKey = z.infer<typeof aggregationBucketKeySchema>;
export type AggregationDateBucketKey = z.infer<typeof aggregationDateBucketKeySchema>;
export type AggregationPayloadBucketKey = z.infer<typeof aggregationPayloadBucketKeySchema>;
export type AggregationBucket = z.infer<typeof aggregationBucketSchema>;
export type AggregationSummary = z.infer<typeof aggregationSummarySchema>;
export type AggregationResponse = z.infer<typeof aggregationResponseSchema>;
