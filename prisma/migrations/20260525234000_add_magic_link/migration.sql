-- Add the MagicLink table for one-shot login URLs issued by the Mikoshi runtime
-- via /api/admin/issue-magic-link. The plaintext token is sent in the URL; the
-- DB stores its SHA-256 hash (same pattern as ApiToken). The consumer endpoint
-- swaps token → Session and marks consumedAt = now so the URL can never be
-- replayed.

CREATE TABLE "MagicLink" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "userId"     TEXT     NOT NULL,
    "token"      TEXT     NOT NULL,
    "expiresAt"  DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "next"       TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MagicLink_token_key" ON "MagicLink"("token");
CREATE INDEX        "MagicLink_userId_idx"    ON "MagicLink"("userId");
CREATE INDEX        "MagicLink_expiresAt_idx" ON "MagicLink"("expiresAt");
