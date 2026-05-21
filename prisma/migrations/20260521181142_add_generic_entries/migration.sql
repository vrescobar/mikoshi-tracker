-- CreateTable
CREATE TABLE "EntryType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "payloadSchema" TEXT NOT NULL,
    "configSchema" TEXT NOT NULL,
    "aggregations" TEXT NOT NULL,
    "skillSlug" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entryTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "config" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_entryTypeId_fkey" FOREIGN KEY ("entryTypeId") REFERENCES "EntryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntryWeekday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    CONSTRAINT "EntryWeekday_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "dateKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "value" DECIMAL,
    "completed" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntryEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventMutation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "previousPayload" TEXT,
    "nextPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventMutation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventMutation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EntryEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CircleEntryShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleEntryShare_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleEntryShare_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mutationId" TEXT NOT NULL,
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
    CONSTRAINT "Attachment_eventMutationId_fkey" FOREIGN KEY ("eventMutationId") REFERENCES "EventMutation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "height", "id", "kind", "mimeType", "mutationId", "originalName", "size", "storageKey", "updatedAt", "userId", "width") SELECT "createdAt", "height", "id", "kind", "mimeType", "mutationId", "originalName", "size", "storageKey", "updatedAt", "userId", "width" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_mutationId_createdAt_idx" ON "Attachment"("mutationId", "createdAt");
CREATE INDEX "Attachment_eventMutationId_createdAt_idx" ON "Attachment"("eventMutationId", "createdAt");
CREATE INDEX "Attachment_userId_idx" ON "Attachment"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EntryType_slug_key" ON "EntryType"("slug");

-- CreateIndex
CREATE INDEX "EntryType_isActive_idx" ON "EntryType"("isActive");

-- CreateIndex
CREATE INDEX "Entry_userId_isActive_idx" ON "Entry"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Entry_entryTypeId_idx" ON "Entry"("entryTypeId");

-- CreateIndex
CREATE INDEX "EntryWeekday_day_idx" ON "EntryWeekday"("day");

-- CreateIndex
CREATE UNIQUE INDEX "EntryWeekday_entryId_day_key" ON "EntryWeekday"("entryId", "day");

-- CreateIndex
CREATE INDEX "EntryEvent_entryId_dateKey_idx" ON "EntryEvent"("entryId", "dateKey");

-- CreateIndex
CREATE INDEX "EntryEvent_entryId_occurredAt_idx" ON "EntryEvent"("entryId", "occurredAt");

-- CreateIndex
CREATE INDEX "EntryEvent_userId_dateKey_idx" ON "EntryEvent"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "EntryEvent_dateKey_idx" ON "EntryEvent"("dateKey");

-- CreateIndex
CREATE INDEX "EventMutation_entryId_dateKey_createdAt_idx" ON "EventMutation"("entryId", "dateKey", "createdAt");

-- CreateIndex
CREATE INDEX "EventMutation_eventId_createdAt_idx" ON "EventMutation"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "CircleEntryShare_entryId_idx" ON "CircleEntryShare"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleEntryShare_circleId_entryId_key" ON "CircleEntryShare"("circleId", "entryId");
