import { z } from "zod";

import { sendChartToWhatsApp } from "../../modules/reports/report.service";
import { CHART_KINDS } from "../../modules/charts/chart.service";
import { getRequestTimestamp } from "../../shared/controller-helpers";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const sendChartInputSchema = z.object({
  kind: z.enum(CHART_KINDS),
  range: z.enum(["7d", "30d", "90d"]).optional(),
  caption: z.string().max(280).optional(),
});

const sendChartResponseSchema = z.object({
  delivered: z.boolean(),
  reason: z.enum(["no_identity", "platform_unavailable", "delivery_failed"]).optional(),
});

const SendChartResponse = registerSchema("SendChartResponse", sendChartResponseSchema);

export function reportsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "POST",
      resource: "reports",
      path: "/reports/chart",
      operationId: "reportsSendChart",
      summary: "Render a nutrition chart and deliver it to the caller's WhatsApp",
      auth: "bearer",
      mutating: true,
      inputSchema: sendChartInputSchema,
      outputSchema: envelope(SendChartResponse),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof sendChartInputSchema>;
        return sendChartToWhatsApp(ctx.deps, {
          userId: requireUserId(ctx),
          kind: input.kind,
          range: input.range,
          caption: input.caption,
          platform: ctx.request.server.mikoshiPlatform,
          timestamp: getRequestTimestamp(ctx.request),
        });
      },
    },
  ];
}
