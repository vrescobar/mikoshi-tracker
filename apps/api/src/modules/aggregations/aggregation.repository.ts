import type { PrismaClient } from "../../generated/prisma/client";

// Only allow alphanumeric + underscore, must start with a letter.
// Prevents SQL injection in dynamic field name interpolation.
function sanitizeFieldName(name: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid aggregation field name: ${name}`);
  }
  return name;
}

function bucketExpression(groupBy: "day" | "week" | "month" | "none"): string {
  switch (groupBy) {
    case "day":
      return "ee.dateKey";
    case "week":
      return "strftime('%Y-W%W', ee.dateKey)";
    case "month":
      return "strftime('%Y-%m', ee.dateKey)";
    case "none":
      return "'total'";
  }
}

export type RawAggregationRow = Record<string, unknown>;

export async function queryAggregationRows(
  db: PrismaClient,
  params: {
    userId: string;
    entryTypeSlug: string;
    entryId?: string;
    from: string;
    to: string;
    groupBy: "day" | "week" | "month" | "none";
    sumFields: string[];
    cachedColumns?: Record<string, string>;
  },
): Promise<RawAggregationRow[]> {
  const { userId, entryTypeSlug, entryId, from, to, groupBy, sumFields, cachedColumns } = params;

  const bucket = bucketExpression(groupBy);

  const sumColumns = sumFields.map((f) => {
    const safe = sanitizeFieldName(f);
    const cached = cachedColumns?.[safe];
    if (cached) {
      // Use the pre-computed column with a json_extract fallback. In production
      // the column is a STORED generated column (never NULL); in test databases
      // it is a plain nullable column so the COALESCE path handles both.
      const cachedSafe = sanitizeFieldName(cached);
      return `SUM(COALESCE(ee.${cachedSafe}, CAST(json_extract(ee.payload, '$.${safe}') AS REAL))) as sum_${safe}`;
    }
    return `SUM(CAST(json_extract(ee.payload, '$.${safe}') AS REAL)) as sum_${safe}`;
  });

  const selectCols = ["COUNT(*) as event_count", ...sumColumns].join(",\n    ");
  const entryFilter = entryId ? "AND ee.entryId = ?" : "";

  const sql = `
    SELECT
      ${bucket} as bucket,
      ${selectCols}
    FROM EntryEvent ee
    JOIN Entry e ON ee.entryId = e.id
    JOIN EntryType et ON e.entryTypeId = et.id
    WHERE ee.userId = ?
      AND et.slug = ?
      AND ee.dateKey >= ?
      AND ee.dateKey <= ?
      ${entryFilter}
      AND COALESCE(
        (SELECT em.type FROM EventMutation em
         WHERE em.eventId = ee.id
         ORDER BY em.createdAt DESC, em.id DESC
         LIMIT 1),
        'NONE'
      ) != 'DELETE'
    GROUP BY 1
    ORDER BY 1
  `;

  const args: unknown[] = [userId, entryTypeSlug, from, to];
  if (entryId) args.push(entryId);

  return db.$queryRawUnsafe<RawAggregationRow[]>(sql, ...args);
}

export type RawPayloadAggregationRow = RawAggregationRow & {
  bucket: string;
  sample_payload: string | null;
};

export async function queryAggregationRowsByPayload(
  db: PrismaClient,
  params: {
    userId: string;
    entryTypeSlug: string;
    entryId?: string;
    from: string;
    to: string;
    payloadField: string;
    sumFields: string[];
    cachedColumns?: Record<string, string>;
    limit: number;
  },
): Promise<RawPayloadAggregationRow[]> {
  const {
    userId,
    entryTypeSlug,
    entryId,
    from,
    to,
    payloadField,
    sumFields,
    cachedColumns,
    limit,
  } = params;

  const safePayloadField = sanitizeFieldName(payloadField);
  // GROUP BY value, normalized to lowercase string. Empty payloads collapse into ""
  // and we filter them out below so the empty bucket doesn't pollute the response.
  const bucketExpr = `LOWER(COALESCE(json_extract(ee.payload, '$.${safePayloadField}'), ''))`;

  const sumColumns = sumFields.map((f) => {
    const safe = sanitizeFieldName(f);
    const cached = cachedColumns?.[safe];
    if (cached) {
      const cachedSafe = sanitizeFieldName(cached);
      return `SUM(COALESCE(ee.${cachedSafe}, CAST(json_extract(ee.payload, '$.${safe}') AS REAL))) as sum_${safe}`;
    }
    return `SUM(CAST(json_extract(ee.payload, '$.${safe}') AS REAL)) as sum_${safe}`;
  });

  const selectCols = [
    "COUNT(*) as event_count",
    // Carry the latest event's payload through so callers can show a sample
    // ("log again" needs a representative payload). Selected via correlated
    // subquery to avoid non-aggregated columns in GROUP BY mode.
    `(SELECT ee2.payload FROM EntryEvent ee2
       JOIN Entry e2 ON ee2.entryId = e2.id
       JOIN EntryType et2 ON e2.entryTypeId = et2.id
       WHERE ee2.userId = ee.userId
         AND et2.slug = et.slug
         AND LOWER(COALESCE(json_extract(ee2.payload, '$.${safePayloadField}'), '')) = ${bucketExpr}
         AND COALESCE(
           (SELECT em2.type FROM EventMutation em2
            WHERE em2.eventId = ee2.id
            ORDER BY em2.createdAt DESC, em2.id DESC
            LIMIT 1), 'NONE') != 'DELETE'
       ORDER BY ee2.occurredAt DESC, ee2.id DESC
       LIMIT 1) as sample_payload`,
    ...sumColumns,
  ].join(",\n    ");

  const entryFilter = entryId ? "AND ee.entryId = ?" : "";

  // limit is a typechecked integer; safe to embed.
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);

  const sql = `
    SELECT
      ${bucketExpr} as bucket,
      ${selectCols}
    FROM EntryEvent ee
    JOIN Entry e ON ee.entryId = e.id
    JOIN EntryType et ON e.entryTypeId = et.id
    WHERE ee.userId = ?
      AND et.slug = ?
      AND ee.dateKey >= ?
      AND ee.dateKey <= ?
      ${entryFilter}
      AND json_extract(ee.payload, '$.${safePayloadField}') IS NOT NULL
      AND COALESCE(
        (SELECT em.type FROM EventMutation em
         WHERE em.eventId = ee.id
         ORDER BY em.createdAt DESC, em.id DESC
         LIMIT 1),
        'NONE'
      ) != 'DELETE'
    GROUP BY 1
    HAVING bucket != ''
    ORDER BY event_count DESC, bucket ASC
    LIMIT ${safeLimit}
  `;

  const args: unknown[] = [userId, entryTypeSlug, from, to];
  if (entryId) args.push(entryId);

  return db.$queryRawUnsafe<RawPayloadAggregationRow[]>(sql, ...args);
}
