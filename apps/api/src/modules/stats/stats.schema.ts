import { overviewStatsSchema } from "@mikoshi-tracker/contracts/stats";

export function parseOverviewStats(input: unknown) {
  return overviewStatsSchema.parse(input);
}
