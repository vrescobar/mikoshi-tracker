import { z } from "zod";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

// Report tools (Epic D): render a chart server-side and deliver it to the
// user's WhatsApp DM. Thin wrapper over POST /v1/reports/chart; unwraps the
// {ok,data} envelope.

const v1Envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data });

const sendChartInputSchema = z.object({
  kind: z.enum(["kcal-trend", "macro-donut"]),
  range: z.enum(["7d", "30d", "90d"]).optional(),
  caption: z.string().max(280).optional(),
});

const sendChartDataSchema = z.object({
  delivered: z.boolean(),
  reason: z.enum(["no_identity", "platform_unavailable", "delivery_failed"]).optional(),
});

export const reportTools: InventoryTool[] = [
  {
    name: "report_send_chart",
    method: "POST",
    path: "/v1/reports/chart",
    description:
      "Render a nutrition chart (kcal-trend or macro-donut) over the chosen range and send it as an image to the user's own WhatsApp DM. Use when the user asks to be sent / shown a chart of their calories or macros. Delivers to the caller only.",
    inputSchema: sendChartInputSchema,
    responseSchema: sendChartDataSchema,
    outputSchema: sendChartDataSchema,
    adapter: "passthrough",
  },
];

export function createReportWriteOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    report_send_chart: async (input: unknown) => {
      const parsed = sendChartInputSchema.parse(input);
      const env = v1Envelope(sendChartDataSchema).parse(
        await client.request("/v1/reports/chart", { method: "POST", body: JSON.stringify(parsed) }),
      );
      const summary = env.data.delivered
        ? `Sent the ${parsed.kind} chart to WhatsApp.`
        : `Could not send the chart (${env.data.reason ?? "unknown"}).`;
      return { payload: env.data, summary };
    },
  };
}
