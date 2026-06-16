import type { PrismaClient } from "../../generated/prisma/client";

export type RawFoodSearchRow = {
  eventId: string;
  name: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  defaultPortionG: number | null;
  isRecipe: number | null;
  usageCount: number | bigint;
  lastUsedAt: number | string | Date;
};

// Canonical soft-delete guard: an event is live unless its latest mutation is a
// DELETE. There is no deleted column, so every food query must replicate this.
const NOT_DELETED = `
  COALESCE(
    (SELECT em.type FROM EventMutation em
     WHERE em.eventId = ee.id
     ORDER BY em.createdAt DESC, em.id DESC
     LIMIT 1),
    'NONE'
  ) != 'DELETE'`;

/**
 * Search a user's previously-logged meals by name, deduped to one row per name
 * (the most-recent occurrence), with a usage count. Uses SQLite's documented
 * "bare columns track the min/max row" behaviour: `MAX(ee.occurredAt)` makes
 * every other selected expression evaluate against that latest row.
 */
export async function searchFoodMealRows(
  db: PrismaClient,
  params: { userId: string; like: string; limit: number },
): Promise<RawFoodSearchRow[]> {
  const sql = `
    SELECT
      ee.id as eventId,
      json_extract(ee.payload, '$.name') as name,
      CAST(json_extract(ee.payload, '$.kcal') AS REAL) as kcal,
      CAST(json_extract(ee.payload, '$.protein_g') AS REAL) as protein_g,
      CAST(json_extract(ee.payload, '$.carbs_g') AS REAL) as carbs_g,
      CAST(json_extract(ee.payload, '$.fat_g') AS REAL) as fat_g,
      json_extract(ee.payload, '$.fiber_g') as fiber_g,
      NULL as defaultPortionG,
      NULL as isRecipe,
      COUNT(*) as usageCount,
      MAX(ee.occurredAt) as lastUsedAt
    FROM EntryEvent ee
    JOIN Entry e ON ee.entryId = e.id
    JOIN EntryType et ON e.entryTypeId = et.id
    WHERE ee.userId = ?
      AND et.slug = 'food_meal'
      AND json_extract(ee.payload, '$.name') IS NOT NULL
      AND LOWER(json_extract(ee.payload, '$.name')) LIKE ?
      AND ${NOT_DELETED}
    GROUP BY LOWER(json_extract(ee.payload, '$.name'))
    ORDER BY lastUsedAt DESC
    LIMIT ?`;
  return db.$queryRawUnsafe<RawFoodSearchRow[]>(sql, params.userId, params.like, params.limit);
}

/**
 * Search a user's saved food items / recipes by name OR alias. Each non-deleted
 * food_item event is one library entry; matches on the name or on the
 * serialized aliases array (a coarse contains, good enough at single-user scale).
 */
export async function searchFoodItemRows(
  db: PrismaClient,
  params: { userId: string; like: string; limit: number },
): Promise<RawFoodSearchRow[]> {
  const sql = `
    SELECT
      ee.id as eventId,
      json_extract(ee.payload, '$.name') as name,
      CAST(json_extract(ee.payload, '$.kcal') AS REAL) as kcal,
      CAST(json_extract(ee.payload, '$.protein_g') AS REAL) as protein_g,
      CAST(json_extract(ee.payload, '$.carbs_g') AS REAL) as carbs_g,
      CAST(json_extract(ee.payload, '$.fat_g') AS REAL) as fat_g,
      json_extract(ee.payload, '$.fiber_g') as fiber_g,
      json_extract(ee.payload, '$.defaultPortionG') as defaultPortionG,
      json_extract(ee.payload, '$.isRecipe') as isRecipe,
      1 as usageCount,
      ee.occurredAt as lastUsedAt
    FROM EntryEvent ee
    JOIN Entry e ON ee.entryId = e.id
    JOIN EntryType et ON e.entryTypeId = et.id
    WHERE ee.userId = ?
      AND et.slug = 'food_item'
      AND json_extract(ee.payload, '$.name') IS NOT NULL
      AND (
        LOWER(json_extract(ee.payload, '$.name')) LIKE ?
        OR LOWER(COALESCE(json_extract(ee.payload, '$.aliases'), '')) LIKE ?
      )
      AND ${NOT_DELETED}
    ORDER BY ee.occurredAt DESC
    LIMIT ?`;
  return db.$queryRawUnsafe<RawFoodSearchRow[]>(sql, params.userId, params.like, params.like, params.limit);
}
