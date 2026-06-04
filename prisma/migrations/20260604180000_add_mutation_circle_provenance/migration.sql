-- B7a: record which circle a mutation was made on behalf of (circle-token or
-- AI-acting-for-a-circle writes). Nullable + additive: a plain ADD COLUMN, no
-- table rebuild, no backfill. Orthogonal to `source` (actor vs scope).
ALTER TABLE "EventMutation" ADD COLUMN "onBehalfOfCircleId" TEXT;
CREATE INDEX "EventMutation_onBehalfOfCircleId_idx" ON "EventMutation"("onBehalfOfCircleId");
