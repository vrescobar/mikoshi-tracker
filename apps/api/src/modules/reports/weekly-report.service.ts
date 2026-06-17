import type { Db } from "../../db/client";
import type { ChartKind } from "../charts/chart.service";
import { DIET_PREFS_SLUG } from "../diet/diet.service";
import type { MikoshiPlatformClient } from "../platform/mikoshi-platform-client";
import { sendChartToWhatsApp } from "./report.service";

type WeeklyReportDeps = { sqlite: Db };

export type WeeklyReportSummary = { attempted: number; delivered: number };

/**
 * Deliver the scheduled weekly chart to every user who has opted in
 * (diet_prefs.config.weeklyReportOptIn === true) AND has a linked Mikoshi
 * identity. Opt-in is required because this is a proactive outbound message
 * (consent: dm-approval). Best-effort per user: one failed delivery never
 * aborts the batch.
 */
export async function runWeeklyReports(
  deps: WeeklyReportDeps,
  params: {
    platform: MikoshiPlatformClient | null;
    kind?: ChartKind;
    range?: "7d" | "30d" | "90d";
    timestamp?: Date | number | string;
  },
): Promise<WeeklyReportSummary> {
  if (!params.platform) return { attempted: 0, delivered: 0 };

  const prefsEntries = deps.sqlite.all<{ userId: string; config: string; externalId: string | null }>(
    `SELECT e."userId" AS "userId", e."config" AS "config", u."externalId" AS "externalId"
     FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId" JOIN "User" u ON u."id" = e."userId"
     WHERE e."isActive" = 1 AND et."slug" = ?`,
    [DIET_PREFS_SLUG],
  );

  let attempted = 0;
  let delivered = 0;
  for (const entry of prefsEntries) {
    if (!isOptedIn(entry.config)) continue;
    if (!entry.externalId) continue;
    attempted += 1;
    const result = await sendChartToWhatsApp(deps, {
      userId: entry.userId,
      kind: params.kind ?? "kcal-trend",
      range: params.range ?? "7d",
      caption: "Your weekly nutrition summary.",
      platform: params.platform,
      timestamp: params.timestamp,
    });
    if (result.delivered) delivered += 1;
  }

  return { attempted, delivered };
}

function isOptedIn(config: string): boolean {
  try {
    const parsed = JSON.parse(config) as { weeklyReportOptIn?: unknown };
    return parsed.weeklyReportOptIn === true;
  } catch {
    return false;
  }
}
