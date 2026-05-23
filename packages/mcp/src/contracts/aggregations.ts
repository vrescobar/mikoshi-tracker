import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const optionalNonEmptyString = z.string().trim().min(1).optional();
const payloadFieldSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "payload field must match [a-zA-Z][a-zA-Z0-9_]*");

export const aggregationGroupBySchema = z.enum(["day", "week", "month", "none"]);

export const aggregationFiltersSchema = z.object({
  entryTypeSlug: nonEmptyString,
  entryId: optionalNonEmptyString,
  from: isoDateSchema,
  to: isoDateSchema,
  groupBy: aggregationGroupBySchema.default("day"),
  fields: optionalNonEmptyString,
  include: optionalNonEmptyString,
  groupByPayload: payloadFieldSchema.optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export const aggregationSumSchema = z.record(z.string(), z.number());

export const aggregationBucketKeySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), value: nonEmptyString }),
  z.object({
    kind: z.literal("payload"),
    field: nonEmptyString,
    value: z.string(),
    sample: z.unknown().optional(),
  }),
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

export const aggregationResponseSchema = z.object({
  buckets: z.array(aggregationBucketSchema),
  total: aggregationSummarySchema,
  weeklyAverage: aggregationSummarySchema.nullable(),
});

export type AggregationFilters = z.infer<typeof aggregationFiltersSchema>;
export type AggregationResponse = z.infer<typeof aggregationResponseSchema>;
