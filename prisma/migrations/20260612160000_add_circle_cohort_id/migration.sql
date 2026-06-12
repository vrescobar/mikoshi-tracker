-- Cohorts = roster (extensions-platform story 51): a circle can be backed by
-- a Mikoshi cohort; its memberships then become a derived cache reconciled by
-- pull (provision/SSO) and push (POST /api/platform/membership).
-- Additive: existing circles keep cohortId NULL (tracker-managed roster).

ALTER TABLE "Circle" ADD COLUMN "cohortId" TEXT;

CREATE UNIQUE INDEX "Circle_cohortId_key" ON "Circle"("cohortId");
