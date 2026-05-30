-- Circle contest lifecycle (start/end window, status, season, leaderboard mode)
-- plus frozen leaderboard snapshots captured at contest close.
-- All additive: existing rows default to status='active', leaderboardMode='rolling',
-- NULL window/season — i.e. legacy "always-on rolling circle" behaviour unchanged.

ALTER TABLE "Circle" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Circle" ADD COLUMN "contestStartAt" DATETIME;
ALTER TABLE "Circle" ADD COLUMN "contestEndAt" DATETIME;
ALTER TABLE "Circle" ADD COLUMN "season" TEXT;
ALTER TABLE "Circle" ADD COLUMN "leaderboardMode" TEXT NOT NULL DEFAULT 'rolling';

CREATE TABLE "CircleLeaderboardSnapshot" (
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

CREATE UNIQUE INDEX "CircleLeaderboardSnapshot_circleId_season_userId_key" ON "CircleLeaderboardSnapshot"("circleId", "season", "userId");
CREATE INDEX "CircleLeaderboardSnapshot_circleId_season_idx" ON "CircleLeaderboardSnapshot"("circleId", "season");
