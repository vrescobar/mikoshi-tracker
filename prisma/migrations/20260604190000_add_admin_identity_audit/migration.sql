-- B7b: named admin tokens (per-operator identity) + an append-only audit trail.
-- Both tables are new and standalone; the static MIKOSHI_TRACKER_ADMIN_API_KEY
-- remains the root credential that bootstraps named tokens.
CREATE TABLE "AdminToken" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "token"      TEXT     NOT NULL,
    "label"      TEXT     NOT NULL,
    "revoked"    BOOLEAN  NOT NULL DEFAULT false,
    "lastUsedAt" DATETIME,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AdminToken_token_key" ON "AdminToken"("token");
CREATE INDEX "AdminToken_revoked_idx" ON "AdminToken"("revoked");

CREATE TABLE "AdminAuditLog" (
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
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
