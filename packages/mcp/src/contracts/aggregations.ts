import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const optionalNonEmptyString = z.string().trim().min(1).optional();

export const aggregationGroupBySchema = z.enum(["day", "week", "month", "none"]);

export const aggregationFiltersSchema = z.object({
  entryTypeSlug: nonEmptyString,
  entryId: optionalNonEmptyString,
  from: isoDateSchema,
  to: isoDateSchema,
  groupBy: aggregationGroupBySchema.default("day"),
  fields: optionalNonEmptyString,
  include: optionalNonEmptyString,
});

export const aggregationSumSchema = z.record(z.string(), z.number());

export const aggregationBucketSchema = z.object({
  key: nonEmptyString,
  sum: aggregationSumSchema,
  count: z.number().int().nonnegative(),
  missing: z.boolean(),
});

export const aggregationSummarySchema = z.object({
  sum: aggregationSumSchema,
  count: z.number().int().nonnegative(),
});

export const aggregationResponseSchema = z.object({
  buckets: z.array(aggregationBucketSchema),
  total: aggregationSummarySchema,
  weeklyAverage: aggregationSummarySchema.nullable(),
});

export type AggregationFilters = z.infer<typeof aggregationFiltersSchema>;
export type AggregationResponse = z.infer<typeof aggregationResponseSchema>;
