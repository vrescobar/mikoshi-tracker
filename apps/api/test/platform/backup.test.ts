/**
 * POST /api/platform/backup — snapshot-pull de respaldo que SOLO Mikoshi puede
 * disparar. Como /hooks/identity, la firma HMAC sobre el body ES la credencial
 * (sin bearer): sin la admin key compartida no se produce una firma válida →
 * 401. La respuesta es un dump SQLite consistente (VACUUM INTO).
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-backup";

function sign(adminKey: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", adminKey).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function backupInject(
  context: TestContext,
  opts: { adminKey?: string; timestamp?: string; signature?: string } = {},
) {
  const rawBody = JSON.stringify({ firedAt: "2026-06-16T10:00:00.000Z" });
  const timestamp = opts.timestamp ?? String(Date.now());
  const signature = opts.signature ?? sign(opts.adminKey ?? ADMIN_KEY, timestamp, rawBody);
  return context.app.inject({
    method: "POST",
    url: "/api/platform/backup",
    headers: {
      "content-type": "application/json",
      "x-mikoshi-timestamp": timestamp,
      "x-mikoshi-signature": signature,
    },
    payload: rawBody,
  });
}

describe("POST /api/platform/backup", () => {
  let context: TestContext | undefined;

  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  });
  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  });

  it("request firmado por Mikoshi → dump SQLite válido", async () => {
    context = await createTestContext();
    const res = await backupInject(context);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/octet-stream");
    const bytes = res.rawPayload;
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("sin firma válida → 401 (caller no autenticado no saca el dump)", async () => {
    context = await createTestContext();
    const res = await backupInject(context, { signature: "sha256=deadbeef" });
    expect(res.statusCode).toBe(401);
  });

  it("firma con otra key → 401", async () => {
    context = await createTestContext();
    const res = await backupInject(context, { adminKey: "otra-key-distinta" });
    expect(res.statusCode).toBe(401);
  });

  it("timestamp fuera de la ventana anti-replay → 401", async () => {
    context = await createTestContext();
    const old = String(Date.now() - 60 * 60_000);
    const res = await backupInject(context, { timestamp: old });
    expect(res.statusCode).toBe(401);
  });
});
