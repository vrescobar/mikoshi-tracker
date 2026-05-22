-- Phase 12: attachments now anchor on EventMutation (eventMutationId). Make the legacy
-- Attachment.mutationId nullable so new uploads need not reference a CheckInMutation.
-- The column + its FK are dropped together with the legacy tables in a later migration.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mutationId" TEXT,
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
    CONSTRAINT "Attachment_mutationId_fkey" FOREIGN KEY ("mutationId") REFERENCES "CheckInMutation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_eventMutationId_fkey" FOREIGN KEY ("eventMutationId") REFERENCES "EventMutation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "eventMutationId", "height", "id", "kind", "mimeType", "mutationId", "originalName", "size", "storageKey", "updatedAt", "userId", "width") SELECT "createdAt", "eventMutationId", "height", "id", "kind", "mimeType", "mutationId", "originalName", "size", "storageKey", "updatedAt", "userId", "width" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_mutationId_createdAt_idx" ON "Attachment"("mutationId", "createdAt");
CREATE INDEX "Attachment_eventMutationId_createdAt_idx" ON "Attachment"("eventMutationId", "createdAt");
CREATE INDEX "Attachment_userId_idx" ON "Attachment"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
