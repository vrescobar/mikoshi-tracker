import {
  aggregationFiltersSchema,
  type AggregationFilters,
} from "@mikoshi-tracker/contracts/aggregations";

export function parseAggregationFilters(input: unknown): AggregationFilters {
  return aggregationFiltersSchema.parse(input);
}
