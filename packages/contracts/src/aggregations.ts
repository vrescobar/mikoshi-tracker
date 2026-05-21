import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const optionalNonEmptyString = z.string().trim().min(1).optional();

export const aggregationGroupBySchema = z.enum(["day", "week", "month", "none"]);

// ─── Input schemas ────────────────────────────────────────────────────────────

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
});

// ─── Domain shapes ────────────────────────────────────────────────────────────

/**
 * sum is keyed by field name (e.g. "kcal", "protein_g"). Values are numeric
 * aggregations over the requested period.
 */
export const aggregationSumSchema = z.record(z.string(), z.number());

export const aggregationBucketSchema = z.object({
  /** YYYY-MM-DD for day, YYYY-Www for week, YYYY-MM for month, "total" for none. */
  key: nonEmptyString,
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
export type AggregationBucket = z.infer<typeof aggregationBucketSchema>;
export type AggregationSummary = z.infer<typeof aggregationSummarySchema>;
export type AggregationResponse = z.infer<typeof aggregationResponseSchema>;
