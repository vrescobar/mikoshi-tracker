-- Performance hardening: add kcal_cached STORED generated column to EntryEvent.
--
-- SQLite does not allow adding a STORED generated column via ALTER TABLE ADD COLUMN,
-- so we use the standard table-rebuild approach.  PRAGMA foreign_keys is turned off
-- for the duration so FK constraints against other tables (EventMutation.eventId →
-- EntryEvent.id) do not block the DROP/RENAME.
--
-- After the rebuild, all four original indexes are recreated plus a new covering index
-- on (userId, dateKey, kcal_cached) that lets the aggregation engine read kcal values
-- directly from the index without touching the payload JSON blob per row.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "EntryEvent_new" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "entryId"    TEXT     NOT NULL,
    "userId"     TEXT     NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "dateKey"    TEXT     NOT NULL,
    "payload"    TEXT     NOT NULL,
    "value"      DECIMAL,
    "completed"  BOOLEAN,
    "kcal_cached" REAL GENERATED ALWAYS AS (CAST(json_extract("payload", '$.kcal') AS REAL)) STORED,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "EntryEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntryEvent_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"  ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "EntryEvent_new"
    ("id", "entryId", "userId", "occurredAt", "dateKey", "payload", "value", "completed", "createdAt", "updatedAt")
SELECT
    "id", "entryId", "userId", "occurredAt", "dateKey", "payload", "value", "completed", "createdAt", "updatedAt"
FROM "EntryEvent";

DROP TABLE "EntryEvent";
ALTER TABLE "EntryEvent_new" RENAME TO "EntryEvent";

-- Recreate original indexes
CREATE INDEX "EntryEvent_entryId_dateKey_idx"    ON "EntryEvent"("entryId", "dateKey");
CREATE INDEX "EntryEvent_entryId_occurredAt_idx" ON "EntryEvent"("entryId", "occurredAt");
CREATE INDEX "EntryEvent_userId_dateKey_idx"     ON "EntryEvent"("userId",  "dateKey");
CREATE INDEX "EntryEvent_dateKey_idx"            ON "EntryEvent"("dateKey");

-- New covering index: allows the aggregation engine to read kcal without accessing the
-- payload column, eliminating per-row json_extract overhead for food_meal queries.
CREATE INDEX "EntryEvent_userId_dateKey_kcal_cached_idx" ON "EntryEvent"("userId", "dateKey", "kcal_cached");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Update the food_meal aggregations spec so the engine knows to use kcal_cached.
-- The INSERT OR IGNORE seed in add_generic_entries set the original spec without
-- cachedColumns; this UPDATE upgrades existing deployments in place.
UPDATE "EntryType"
SET    "aggregations" = '{"metrics":["sum","count","missing_days"],"sumFields":["kcal","protein_g","carbs_g","fat_g"],"cachedColumns":{"kcal":"kcal_cached"}}'
WHERE  "slug" = 'food_meal';
