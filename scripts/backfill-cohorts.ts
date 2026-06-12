#!/usr/bin/env bun
/**
 * One-shot backfill (extensions-platform story 51): create a Mikoshi cohort
 * per pre-existing circle and link `Circle.cohortId`.
 *
 *   bun scripts/backfill-cohorts.ts --dry-run   # plan only, no writes anywhere
 *   bun scripts/backfill-cohorts.ts             # create cohorts + link circles
 *
 * Env:
 *   DATABASE_URL        tracker DB (default: the production path)
 *   MIKOSHI_V1_API_URL  Mikoshi private v1 API (default http://127.0.0.1:7777/api/v1)
 *
 * Idempotent: circles already linked (cohortId != null) are skipped, so a
 * partial run can be resumed. Member identityIds are the externalIds tracker
 * already stores — they ARE Mikoshi identity ids.
 */
import { homedir } from "node:os";

import { createPrismaClient } from "../apps/api/src/plugins/db";
import {
  applyCohortBackfill,
  planCohortBackfill,
} from "../apps/api/src/modules/platform/cohort-backfill";

const DEFAULT_DB = `file:${homedir()}/.local/share/mikoshi-tracker/mikoshi-tracker.db`;
const DEFAULT_V1 = "http://127.0.0.1:7777/api/v1";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DB;
  const v1BaseUrl = process.env.MIKOSHI_V1_API_URL ?? DEFAULT_V1;

  const db = createPrismaClient(databaseUrl);
  try {
    const circles = await db.circle.findMany({
      select: { id: true, name: true, cohortId: true },
    });
    const memberships = await db.circleMembership.findMany({
      select: { circleId: true, externalId: true, role: true },
    });

    const plan = planCohortBackfill(circles, memberships);

    console.log(`DB: ${databaseUrl}`);
    console.log(
      `Circles: ${circles.length} total, ${plan.alreadyLinked} ya enlazados, ` +
        `${plan.cohorts.length} a backfillear`,
    );
    console.log(`Memberships examinadas: ${plan.membershipsExamined}`);
    for (const cohort of plan.cohorts) {
      console.log(
        `  - circle "${cohort.circleName}" (${cohort.circleId}) → cohort "${cohort.cohortName}": ` +
          `${cohort.memberExternalIds.length} members con externalId, ` +
          `${cohort.webOnlyMemberships} web-only fuera del cohort`,
      );
      for (const externalId of cohort.memberExternalIds) {
        console.log(`      member ${externalId}`);
      }
    }

    if (dryRun) {
      console.log("\n--dry-run: no se ha escrito nada (ni en tracker ni en mikoshi).");
      return;
    }

    console.log(`\nAplicando contra ${v1BaseUrl} …`);
    const results = await applyCohortBackfill(db, plan, { v1BaseUrl });
    for (const result of results) {
      console.log(
        `  ✓ circle ${result.circleId} → cohort ${result.cohortId} (${result.membersAdded} members)`,
      );
    }
    console.log("Backfill completo.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
