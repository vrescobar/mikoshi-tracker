import type { PrismaClient } from "../../generated/prisma/client";
import type { Db } from "../../db/client";
import { type ChartKind, renderChartPng } from "../charts/chart.service";
import type { MikoshiPlatformClient } from "../platform/mikoshi-platform-client";

type ReportServiceDeps = { db: PrismaClient; sqlite: Db };

export type SendChartResult = {
  delivered: boolean;
  reason?: "no_identity" | "platform_unavailable" | "delivery_failed";
};

const CAPTIONS: Record<ChartKind, string> = {
  "kcal-trend": "Your calories over the selected range.",
  "macro-donut": "Your macro composition over the selected range.",
};

/**
 * Render a chart for `userId` and deliver it to that user's WhatsApp DM via the
 * Mikoshi platform notify-image capability. Render + delivery stay inside the
 * tracker's trust boundary (the PNG bytes and the user's token never leave it);
 * the report skill only orchestrates "send chart X for the issuer". Strictly
 * single-user: the chart is always the caller's own data.
 */
export async function sendChartToWhatsApp(
  deps: ReportServiceDeps,
  params: {
    userId: string;
    kind: ChartKind;
    range?: string;
    caption?: string;
    platform: MikoshiPlatformClient | null;
    timestamp?: Date | number | string;
  },
): Promise<SendChartResult> {
  if (!params.platform) return { delivered: false, reason: "platform_unavailable" };

  const user = await deps.db.user.findUnique({
    where: { id: params.userId },
    select: { externalId: true },
  });
  if (!user?.externalId) return { delivered: false, reason: "no_identity" };

  const png = await renderChartPng(deps, {
    userId: params.userId,
    kind: params.kind,
    range: params.range,
    timestamp: params.timestamp,
  });

  const delivered = await params.platform.notifyImage({
    externalId: user.externalId,
    imageBase64: png.toString("base64"),
    caption: params.caption ?? CAPTIONS[params.kind],
  });

  return delivered ? { delivered: true } : { delivered: false, reason: "delivery_failed" };
}
