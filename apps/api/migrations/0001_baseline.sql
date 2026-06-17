-- 0001_baseline.sql
-- Baseline schema for MikoshiTracker, derived from the Prisma-managed schema
-- (prisma/migrations, 18 migrations) at migration cutover. Idempotent:
-- CREATE TABLE/INDEX use IF NOT EXISTS so applying it over an existing
-- (Prisma-created) database is a no-op. Includes better-auth tables
-- (User/Session/Account/Verification) and app tables.

CREATE TABLE IF NOT EXISTS "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_token_key" ON "ApiToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_userId_key" ON "ApiToken"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX IF NOT EXISTS "Verification_identifier_idx" ON "Verification"("identifier");
CREATE UNIQUE INDEX IF NOT EXISTS "Verification_identifier_value_key" ON "Verification"("identifier", "value");
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false
, "externalId" TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE TABLE IF NOT EXISTS "Circle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "status" TEXT NOT NULL DEFAULT 'active', "contestStartAt" DATETIME, "contestEndAt" DATETIME, "season" TEXT, "leaderboardMode" TEXT NOT NULL DEFAULT 'rolling', "contestKind" TEXT NOT NULL DEFAULT 'habit', "metricEntryTypeSlug" TEXT, "metricField" TEXT, "metricMode" TEXT, "metricTarget" REAL, "metricGoal" TEXT DEFAULT 'higher', "cohortId" TEXT,
    CONSTRAINT "Circle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "CircleMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "externalId" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleMembership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "CircleToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CircleToken_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CircleMembership_externalId_idx" ON "CircleMembership"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleMembership_circleId_userId_key" ON "CircleMembership"("circleId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleMembership_circleId_externalId_key" ON "CircleMembership"("circleId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleToken_token_key" ON "CircleToken"("token");
CREATE INDEX IF NOT EXISTS "CircleToken_circleId_idx" ON "CircleToken"("circleId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_externalId_key" ON "User"("externalId");
CREATE TABLE IF NOT EXISTS "EntryType" (
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
CREATE TABLE IF NOT EXISTS "Entry" (
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
CREATE TABLE IF NOT EXISTS "EntryWeekday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    CONSTRAINT "EntryWeekday_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "EventMutation" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "onBehalfOfCircleId" TEXT,
    CONSTRAINT "EventMutation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventMutation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EntryEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "CircleEntryShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleEntryShare_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleEntryShare_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EntryType_slug_key" ON "EntryType"("slug");
CREATE INDEX IF NOT EXISTS "EntryType_isActive_idx" ON "EntryType"("isActive");
CREATE INDEX IF NOT EXISTS "Entry_userId_isActive_idx" ON "Entry"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "Entry_entryTypeId_idx" ON "Entry"("entryTypeId");
CREATE INDEX IF NOT EXISTS "EntryWeekday_day_idx" ON "EntryWeekday"("day");
CREATE UNIQUE INDEX IF NOT EXISTS "EntryWeekday_entryId_day_key" ON "EntryWeekday"("entryId", "day");
CREATE INDEX IF NOT EXISTS "EventMutation_entryId_dateKey_createdAt_idx" ON "EventMutation"("entryId", "dateKey", "createdAt");
CREATE INDEX IF NOT EXISTS "EventMutation_eventId_createdAt_idx" ON "EventMutation"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "CircleEntryShare_entryId_idx" ON "CircleEntryShare"("entryId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleEntryShare_circleId_entryId_key" ON "CircleEntryShare"("circleId", "entryId");
CREATE TABLE IF NOT EXISTS "EntryEvent" (
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
CREATE INDEX IF NOT EXISTS "EntryEvent_entryId_dateKey_idx"    ON "EntryEvent"("entryId", "dateKey");
CREATE INDEX IF NOT EXISTS "EntryEvent_entryId_occurredAt_idx" ON "EntryEvent"("entryId", "occurredAt");
CREATE INDEX IF NOT EXISTS "EntryEvent_userId_dateKey_idx"     ON "EntryEvent"("userId",  "dateKey");
CREATE INDEX IF NOT EXISTS "EntryEvent_dateKey_idx"            ON "EntryEvent"("dateKey");
CREATE INDEX IF NOT EXISTS "EntryEvent_userId_dateKey_kcal_cached_idx" ON "EntryEvent"("userId", "dateKey", "kcal_cached");
CREATE TABLE IF NOT EXISTS "Attachment" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX IF NOT EXISTS "Attachment_eventMutationId_createdAt_idx" ON "Attachment"("eventMutationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Attachment_userId_idx" ON "Attachment"("userId");
CREATE TABLE IF NOT EXISTS "MagicLink" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "userId"     TEXT     NOT NULL,
    "token"      TEXT     NOT NULL,
    "expiresAt"  DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "next"       TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MagicLink_token_key" ON "MagicLink"("token");
CREATE INDEX IF NOT EXISTS "MagicLink_userId_idx"    ON "MagicLink"("userId");
CREATE INDEX IF NOT EXISTS "MagicLink_expiresAt_idx" ON "MagicLink"("expiresAt");
CREATE TABLE IF NOT EXISTS "CircleLeaderboardSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleLeaderboardSnapshot_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleLeaderboardSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CircleLeaderboardSnapshot_circleId_season_userId_key" ON "CircleLeaderboardSnapshot"("circleId", "season", "userId");
CREATE INDEX IF NOT EXISTS "CircleLeaderboardSnapshot_circleId_season_idx" ON "CircleLeaderboardSnapshot"("circleId", "season");
CREATE INDEX IF NOT EXISTS "EventMutation_onBehalfOfCircleId_idx" ON "EventMutation"("onBehalfOfCircleId");
CREATE TABLE IF NOT EXISTS "AdminToken" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "token"      TEXT     NOT NULL,
    "label"      TEXT     NOT NULL,
    "revoked"    BOOLEAN  NOT NULL DEFAULT false,
    "lastUsedAt" DATETIME,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminToken_token_key" ON "AdminToken"("token");
CREATE INDEX IF NOT EXISTS "AdminToken_revoked_idx" ON "AdminToken"("revoked");
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "actorType"  TEXT     NOT NULL,
    "actorId"    TEXT,
    "actorLabel" TEXT,
    "action"     TEXT     NOT NULL,
    "targetType" TEXT,
    "targetId"   TEXT,
    "metadata"   TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE UNIQUE INDEX IF NOT EXISTS "Circle_cohortId_key" ON "Circle"("cohortId");
