import { afterEach, describe, expect, it, vi } from "vitest";

import { sendChartToWhatsApp } from "../../src/modules/reports/report.service";
import type { MikoshiPlatformClient } from "../../src/modules/platform/mikoshi-platform-client";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const NOW = "2026-05-10T12:00:00.000Z";

describe("report: send chart to WhatsApp", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("renders and delivers a chart for a user with a Mikoshi identity", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app, { timezone: "UTC" });
    await context.app.db.user.update({ where: { id: body.user.id }, data: { externalId: "ext_42" } });

    const notifyImage = vi.fn().mockResolvedValue(true);
    const platform = { notifyImage } as unknown as MikoshiPlatformClient;

    const result = await sendChartToWhatsApp(
      { db: context.app.db },
      { userId: body.user.id, kind: "macro-donut", platform, timestamp: NOW },
    );

    expect(result).toEqual({ delivered: true });
    expect(notifyImage).toHaveBeenCalledTimes(1);
    const arg = notifyImage.mock.calls[0]![0] as { externalId: string; imageBase64: string };
    expect(arg.externalId).toBe("ext_42");
    // base64 PNG starts with iVBORw0KGgo (the \x89PNG header).
    expect(arg.imageBase64.startsWith("iVBORw0KGgo")).toBe(true);
  });

  it("reports no_identity when the user has no Mikoshi externalId", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app, { timezone: "UTC" });

    const platform = { notifyImage: vi.fn() } as unknown as MikoshiPlatformClient;
    const result = await sendChartToWhatsApp(
      { db: context.app.db },
      { userId: body.user.id, kind: "kcal-trend", platform, timestamp: NOW },
    );

    expect(result).toEqual({ delivered: false, reason: "no_identity" });
  });

  it("reports platform_unavailable when no platform client is configured", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app, { timezone: "UTC" });

    const result = await sendChartToWhatsApp(
      { db: context.app.db },
      { userId: body.user.id, kind: "kcal-trend", platform: null, timestamp: NOW },
    );

    expect(result).toEqual({ delivered: false, reason: "platform_unavailable" });
  });

  it("POST /api/v1/reports/chart is bearer-guarded and validates kind", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { timezone: "UTC" });

    const unauth = await context.app.inject({ method: "POST", url: "/api/v1/reports/chart", payload: { kind: "kcal-trend" } });
    expect(unauth.statusCode).toBe(401);

    const badKind = await context.app.inject({
      method: "POST",
      url: "/api/v1/reports/chart",
      headers: { cookie },
      payload: { kind: "pie-in-the-sky" },
    });
    expect(badKind.statusCode).toBe(400);
  });
});
