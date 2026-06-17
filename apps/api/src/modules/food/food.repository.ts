import type { Db } from "../../db/client";

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
  db: Db,
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
  return db.all<RawFoodSearchRow>(sql, [params.userId, params.like, params.limit]);
}

/**
 * Search a user's saved food items / recipes by name OR alias. Each non-deleted
 * food_item event is one library entry; matches on the name or on the
 * serialized aliases array (a coarse contains, good enough at single-user scale).
 */
export async function searchFoodItemRows(
  db: Db,
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
  return db.all<RawFoodSearchRow>(sql, [params.userId, params.like, params.like, params.limit]);
}

export type RawFoodDayRow = {
  eventId: string;
  occurredAt: number | string | Date;
  dateKey: string;
  payload: string;
  source: string | null;
};

/**
 * The day's non-deleted food_meal events for a user, oldest-first, each tagged
 * with the source of its latest mutation (WEB/AI/SYSTEM/CIRCLE) so the GUI can
 * show provenance without an extra detail round-trip.
 */
export async function listFoodDayRows(
  db: Db,
  params: { userId: string; dateKey: string },
): Promise<RawFoodDayRow[]> {
  const sql = `
    SELECT
      ee.id as eventId,
      ee.occurredAt as occurredAt,
      ee.dateKey as dateKey,
      ee.payload as payload,
      (SELECT em.source FROM EventMutation em
        WHERE em.eventId = ee.id
        ORDER BY em.createdAt DESC, em.id DESC
        LIMIT 1) as source
    FROM EntryEvent ee
    JOIN Entry e ON ee.entryId = e.id
    JOIN EntryType et ON e.entryTypeId = et.id
    WHERE ee.userId = ?
      AND et.slug = 'food_meal'
      AND ee.dateKey = ?
      AND ${NOT_DELETED}
    ORDER BY ee.occurredAt ASC, ee.id ASC`;
  return db.all<RawFoodDayRow>(sql, [params.userId, params.dateKey]);
}

export type RawFoodDayAttachment = {
  eventId: string;
  id: string;
  width: number | null;
  height: number | null;
};

/**
 * Photo attachments for the given events, scoped to the owner. Attachments hang
 * off EventMutations; we gather them across all of an event's mutations so a
 * photo survives a later edit (which would add a newer, photo-less mutation).
 */
export async function listFoodDayAttachments(
  db: Db,
  params: { userId: string; eventIds: string[] },
): Promise<RawFoodDayAttachment[]> {
  if (params.eventIds.length === 0) return [];
  const placeholders = params.eventIds.map(() => "?").join(",");
  const sql = `
    SELECT em.eventId as eventId, a.id as id, a.width as width, a.height as height
    FROM Attachment a
    JOIN EventMutation em ON em.id = a.eventMutationId
    WHERE a.userId = ?
      AND em.eventId IN (${placeholders})
    ORDER BY a.createdAt ASC, a.id ASC`;
  return db.all<RawFoodDayAttachment>(sql, [params.userId, ...params.eventIds]);
}
