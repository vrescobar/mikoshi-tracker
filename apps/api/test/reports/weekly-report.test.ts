import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { runWeeklyReports } from "../../src/modules/reports/weekly-report.service";
import type { MikoshiPlatformClient } from "../../src/modules/platform/mikoshi-platform-client";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-weekly-report";
const NOW = "2026-05-10T12:00:00.000Z";

function sign(timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", ADMIN_KEY).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

describe("weekly report (Epic E)", () => {
  let context: TestContext | undefined;

  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  });

  afterEach(async () => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  async function setPrefs(cookie: string, body: Record<string, unknown>) {
    await context!.app.inject({
      method: "POST",
      url: "/api/v1/diet/preferences",
      headers: { cookie },
      payload: body,
    });
  }

  it("delivers only to opted-in users with a Mikoshi identity", async () => {
    context = await createTestContext();
    const optedIn = await signUp(context.app, { timezone: "UTC", email: "in@example.com" });
    const optedOut = await signUp(context.app, { timezone: "UTC", email: "out@example.com" });

    await context.app.db.user.update({ where: { id: optedIn.body.user.id }, data: { externalId: "ext_in" } });
    await context.app.db.user.update({ where: { id: optedOut.body.user.id }, data: { externalId: "ext_out" } });
    await setPrefs(optedIn.cookie, { weeklyReportOptIn: true });
    await setPrefs(optedOut.cookie, { weeklyReportOptIn: false });

    const notifyImage = mock().mockResolvedValue(true);
    const platform = { notifyImage } as unknown as MikoshiPlatformClient;

    const summary = await runWeeklyReports({ db: context.app.db }, { platform, timestamp: NOW });

    expect(summary).toEqual({ attempted: 1, delivered: 1 });
    expect(notifyImage).toHaveBeenCalledTimes(1);
    expect((notifyImage.mock.calls[0]![0] as { externalId: string }).externalId).toBe("ext_in");
  });

  it("skips opted-in users without a Mikoshi identity", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { timezone: "UTC" });
    await setPrefs(cookie, { weeklyReportOptIn: true });

    const platform = { notifyImage: mock().mockResolvedValue(true) } as unknown as MikoshiPlatformClient;
    const summary = await runWeeklyReports({ db: context.app.db }, { platform, timestamp: NOW });
    expect(summary).toEqual({ attempted: 0, delivered: 0 });
  });

  it("POST /hooks/cron/weekly-report rejects a bad signature and accepts a valid one", async () => {
    context = await createTestContext();

    const rawBody = JSON.stringify({ event: "cron.weekly-report" });

    const bad = await context.app.inject({
      method: "POST",
      url: "/hooks/cron/weekly-report",
      headers: { "content-type": "application/json", "x-mikoshi-timestamp": String(Date.now()), "x-mikoshi-signature": "sha256=deadbeef" },
      payload: rawBody,
    });
    expect(bad.statusCode).toBe(401);

    const ts = String(Date.now());
    const ok = await context.app.inject({
      method: "POST",
      url: "/hooks/cron/weekly-report",
      headers: { "content-type": "application/json", "x-mikoshi-timestamp": ts, "x-mikoshi-signature": sign(ts, rawBody) },
      payload: rawBody,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true });
  });
});
