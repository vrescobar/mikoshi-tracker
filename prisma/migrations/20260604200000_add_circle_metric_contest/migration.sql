-- B7c (part 1): metric contests on Circle — score by aggregating a payload field
-- of an entry type (kcal/weight/steps) instead of shared-habit completion.
-- All additive: defaulted/nullable ADD COLUMNs, no rebuild. Existing circles
-- stay contestKind="habit" (current behavior).
ALTER TABLE "Circle" ADD COLUMN "contestKind" TEXT NOT NULL DEFAULT 'habit';
ALTER TABLE "Circle" ADD COLUMN "metricEntryTypeSlug" TEXT;
ALTER TABLE "Circle" ADD COLUMN "metricField" TEXT;
ALTER TABLE "Circle" ADD COLUMN "metricMode" TEXT;
ALTER TABLE "Circle" ADD COLUMN "metricTarget" REAL;
ALTER TABLE "Circle" ADD COLUMN "metricGoal" TEXT DEFAULT 'higher';
