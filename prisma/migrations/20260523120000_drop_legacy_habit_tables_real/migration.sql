-- Phase 12 finish: drop the legacy Habit* tables after the unification (tareas 41/42)
-- moved habits/today/checkin/stats/circles/attachments onto the generic Entry engine.
-- The earlier `drop_legacy_habit_tables` migration was a no-op (it dropped `_legacy_*`
-- tables that never existed because task 40's original rename was skipped); this one
-- drops the real tables and removes Attachment.mutationId.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Rebuild Attachment without the legacy mutationId column / FK. Rows keep their
-- eventMutationId (set by the unification commit).
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventMutationId" TEXT,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attachment_eventMutationId_fkey" FOREIGN KEY ("eventMutationId") REFERENCES "EventMutation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "eventMutationId", "height", "id", "kind", "mimeType", "originalName", "size", "storageKey", "updatedAt", "userId", "width") SELECT "createdAt", "eventMutationId", "height", "id", "kind", "mimeType", "originalName", "size", "storageKey", "updatedAt", "userId", "width" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_eventMutationId_createdAt_idx" ON "Attachment"("eventMutationId", "createdAt");
CREATE INDEX "Attachment_userId_idx" ON "Attachment"("userId");

-- Drop the five legacy tables (in FK-dependency order).
DROP TABLE IF EXISTS "CircleHabitShare";
DROP TABLE IF EXISTS "CheckInMutation";
DROP TABLE IF EXISTS "HabitDayState";
DROP TABLE IF EXISTS "HabitWeekday";
DROP TABLE IF EXISTS "Habit";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
