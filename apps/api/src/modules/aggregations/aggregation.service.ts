import type {
  AggregationBucket,
  AggregationGroupBy,
  AggregationResponse,
  AggregationSum,
  AggregationSummary,
} from "@mikoshi-tracker/contracts/aggregations";

import type { Db } from "../../db/client";
import { getCompiledSchema } from "../entry-types/schema-cache";
import { getEntryTypeBySlug } from "../entry-types/entry-type.repository";
import {
  type RawAggregationRow,
  queryAggregationRows,
  queryAggregationRowsByPayload,
} from "./aggregation.repository";

// ─── Error classes ─────────────────────────────────────────────────────────────

export class EntryTypeForAggregationNotFoundError extends Error {
  constructor(slug: string) {
    super(`EntryType not found: ${slug}`);
    this.name = "EntryTypeForAggregationNotFoundError";
  }
}

// ─── Internal types ────────────────────────────────────────────────────────────

type AggregationServiceDeps = { sqlite: Db };

// ─── Date / bucket helpers ─────────────────────────────────────────────────────

// Compute the week bucket matching SQLite's strftime('%Y-W%W', dateKey).
// %W: Monday-first week, 00-53. Days before the first Monday of the year are week 00.
function dayToWeekBucket(dateKey: string): string {
  const date = new Date(dateKey + "T00:00:00Z");
  const year = date.getUTCFullYear();
  const startOfYear = new Date(`${year}-01-01T00:00:00Z`);
  // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const startDayOfWeek = startOfYear.getUTCDay();
  // Days until the first Monday from Jan 1 (0 if Jan 1 is Monday)
  const firstMondayDayOfYear = (7 - ((startDayOfWeek - 1 + 7) % 7)) % 7;
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const weekNum =
    dayOfYear < firstMondayDayOfYear
      ? 0
      : Math.floor((dayOfYear - firstMondayDayOfYear) / 7) + 1;
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function generateExpectedBuckets(
  from: string,
  to: string,
  groupBy: AggregationGroupBy,
): string[] {
  if (groupBy === "none") return ["total"];

  const days: string[] = [];
  let current = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current = new Date(current.getTime() + 86400000);
  }

  if (groupBy === "day") return days;

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const day of days) {
    const bucket = groupBy === "week" ? dayToWeekBucket(day) : day.slice(0, 7);
    if (!seen.has(bucket)) {
      seen.add(bucket);
      result.push(bucket);
    }
  }
  return result;
}

// ─── Numeric helpers ───────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function emptySum(fields: string[]): AggregationSum {
  const s: AggregationSum = {};
  for (const f of fields) s[f] = 0;
  return s;
}

function buildSumFromRow(row: RawAggregationRow, fields: string[]): AggregationSum {
  const s: AggregationSum = {};
  for (const f of fields) s[f] = toNumber(row[`sum_${f}`]);
  return s;
}

function addToSum(acc: AggregationSum, addend: AggregationSum): void {
  for (const [k, v] of Object.entries(addend)) {
    acc[k] = (acc[k] ?? 0) + v;
  }
}

function divideSum(sum: AggregationSum, divisor: number): AggregationSum {
  if (divisor === 0) return { ...sum };
  const s: AggregationSum = {};
  for (const [k, v] of Object.entries(sum)) s[k] = v / divisor;
  return s;
}

// ─── Public service function ───────────────────────────────────────────────────

export async function computeAggregations(
  deps: AggregationServiceDeps,
  params: {
    userId: string;
    entryTypeSlug: string;
    entryId?: string;
    from: string;
    to: string;
    groupBy: AggregationGroupBy;
    fields?: string;
    include?: string;
    groupByPayload?: string;
    limit?: number;
  },
): Promise<AggregationResponse> {
  const {
    userId,
    entryTypeSlug,
    entryId,
    from,
    to,
    groupBy,
    fields,
    include,
    groupByPayload,
    limit,
  } = params;

  const entryType = getEntryTypeBySlug(deps.sqlite, entryTypeSlug);
  if (!entryType) throw new EntryTypeForAggregationNotFoundError(entryTypeSlug);

  const compiled = await getCompiledSchema(deps.sqlite, entryType.id);
  const spec = compiled.aggregations;

  // Determine which sum fields to compute, optionally filtered by ?fields=
  const allSumFields = spec.sumFields ?? [];
  const requestedFields = fields
    ? fields
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : allSumFields;
  const activeSumFields = allSumFields.filter((f) => requestedFields.includes(f));

  const includeMissingDays =
    include
      ?.split(",")
      .map((s) => s.trim())
      .includes("missing_days") ?? false;

  // ── Payload-grouped path ───────────────────────────────────────────────────
  if (groupByPayload) {
    const rows = await queryAggregationRowsByPayload(deps.sqlite, {
      userId,
      entryTypeSlug,
      entryId,
      from,
      to,
      payloadField: groupByPayload,
      sumFields: activeSumFields,
      cachedColumns: spec.cachedColumns,
      limit: limit ?? 25,
    });

    const buckets: AggregationBucket[] = [];
    let totalCount = 0;
    const totalSum = emptySum(activeSumFields);

    for (const row of rows) {
      const count = toNumber(row.event_count);
      const sum = buildSumFromRow(row, activeSumFields);
      let sample: unknown = undefined;
      if (row.sample_payload) {
        try {
          sample = JSON.parse(row.sample_payload);
        } catch {
          sample = undefined;
        }
      }
      buckets.push({
        key: {
          kind: "payload",
          field: groupByPayload,
          value: row.bucket,
          ...(sample !== undefined ? { sample } : {}),
        },
        sum,
        count,
        missing: false,
      });
      totalCount += count;
      addToSum(totalSum, sum);
    }

    return {
      buckets,
      total: { sum: totalSum, count: totalCount },
      // Weekly average has no meaning when grouping by a non-temporal axis.
      weeklyAverage: null,
    };
  }

  // ── Date-grouped path (existing behaviour) ─────────────────────────────────
  const rawRows = await queryAggregationRows(deps.sqlite, {
    userId,
    entryTypeSlug,
    entryId,
    from,
    to,
    groupBy,
    sumFields: activeSumFields,
    cachedColumns: spec.cachedColumns,
  });

  const rowByBucket = new Map<string, RawAggregationRow>();
  for (const row of rawRows) {
    rowByBucket.set(String(row.bucket), row);
  }

  const expectedBuckets = generateExpectedBuckets(from, to, groupBy);

  const buckets: AggregationBucket[] = [];
  let totalCount = 0;
  const totalSum = emptySum(activeSumFields);

  for (const bucketKey of expectedBuckets) {
    const row = rowByBucket.get(bucketKey);
    if (row) {
      const count = toNumber(row.event_count);
      const sum = buildSumFromRow(row, activeSumFields);
      buckets.push({ key: { kind: "date", value: bucketKey }, sum, count, missing: false });
      totalCount += count;
      addToSum(totalSum, sum);
    } else if (includeMissingDays) {
      buckets.push({
        key: { kind: "date", value: bucketKey },
        sum: emptySum(activeSumFields),
        count: 0,
        missing: true,
      });
    }
  }

  // weeklyAverage is null when groupBy is "none" or range < 7 days
  const dayRange =
    Math.floor(
      (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) /
        86400000,
    ) + 1;

  let weeklyAverage: AggregationSummary | null = null;
  if (groupBy !== "none" && dayRange >= 7) {
    const numWeeks = dayRange / 7;
    weeklyAverage = {
      sum: divideSum(totalSum, numWeeks),
      count: Math.round(totalCount / numWeeks),
    };
  }

  return {
    buckets,
    total: { sum: totalSum, count: totalCount },
    weeklyAverage,
  };
}
