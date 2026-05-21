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
  },
): Promise<RawAggregationRow[]> {
  const { userId, entryTypeSlug, entryId, from, to, groupBy, sumFields } = params;

  const bucket = bucketExpression(groupBy);

  const sumColumns = sumFields.map((f) => {
    const safe = sanitizeFieldName(f);
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

  return db.$queryRawUnsafe(sql, ...args) as Promise<RawAggregationRow[]>;
}
