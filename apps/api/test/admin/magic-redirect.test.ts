/**
 * GET /magic landing-route tests.
 *
 * The route consumes a magic-link token and 303-redirects into the app with
 * the better-auth session cookie set. The URL shape `{base}/magic?t=...` is a
 * contract with the Mikoshi WhatsApp bot, and the Set-Cookie header must stay
 * byte-compatible with what the retired Next.js route handler emitted
 * (HttpOnly; SameSite=Lax; Path=/; Max-Age; conditional Secure).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

async function provisionUser(context: TestContext, externalId: string): Promise<string> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/provision-user",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, timezone: "Europe/Madrid" },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { userId: string }).userId;
}

async function issueToken(context: TestContext, externalId: string, next?: string): Promise<string> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/issue-magic-link",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: next ? { externalId, next } : { externalId },
  });
  expect(res.statusCode).toBe(201);
  return new URL((res.json() as { url: string }).url).searchParams.get("t")!;
}

describe("GET /magic", () => {
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

  it("303-redirects to the per-link next with a session cookie", async () => {
    context = await createTestContext();
    const userId = await provisionUser(context, "ext-redirect-1");
    const token = await issueToken(context, "ext-redirect-1", "/food");

    const res = await context.app.inject({ method: "GET", url: `/magic?t=${token}` });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/food");

    const setCookie = res.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    expect(cookie).toMatch(/^better-auth\.session_token=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/);
    // Test env is plain HTTP → no Secure attribute.
    expect(cookie).not.toContain("Secure");

    // The cookie maps to a real Session row for the provisioned user.
    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const sessionToken = decodeURIComponent(value).split(".")[0]!;
    const session = await context.app.db.session.findUnique({ where: { token: sessionToken } });
    expect(session?.userId).toBe(userId);
  });

  it("falls back to the ?next= query param when the link carries none", async () => {
    context = await createTestContext();
    await provisionUser(context, "ext-redirect-querynext");
    const token = await issueToken(context, "ext-redirect-querynext");

    const res = await context.app.inject({
      method: "GET",
      url: `/magic?t=${token}&next=${encodeURIComponent("/circles")}`,
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/circles");
  });

  it("ignores tampered next values (protocol-relative and absolute URLs)", async () => {
    context = await createTestContext();
    await provisionUser(context, "ext-redirect-tamper");

    for (const evil of ["//evil.example.com", "https://evil.example.com/x"]) {
      const token = await issueToken(context, "ext-redirect-tamper");
      const res = await context.app.inject({
        method: "GET",
        url: `/magic?t=${token}&next=${encodeURIComponent(evil)}`,
      });
      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toBe("/");
    }
  });

  it("redirects to /?magicError=missing without a token", async () => {
    context = await createTestContext();

    const res = await context.app.inject({ method: "GET", url: "/magic" });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/?magicError=missing");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("redirects to /?magicError=invalid for an unknown token", async () => {
    context = await createTestContext();

    const res = await context.app.inject({
      method: "GET",
      url: `/magic?t=${"0".repeat(64)}`,
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/?magicError=invalid");
  });

  it("tolerates a prefetch/preview double-GET: the second GET still logs in", async () => {
    // A link-preview bot or browser prefetch may GET the URL (burning the
    // single-use flag) before the human taps it. Within the TTL the real click
    // must still succeed — log in and set the cookie, not error "used".
    context = await createTestContext();
    await provisionUser(context, "ext-redirect-replay");
    const token = await issueToken(context, "ext-redirect-replay");

    const first = await context.app.inject({ method: "GET", url: `/magic?t=${token}` });
    expect(first.statusCode).toBe(303);
    expect(first.headers.location).toBe("/");

    const second = await context.app.inject({ method: "GET", url: `/magic?t=${token}` });
    expect(second.statusCode).toBe(303);
    expect(second.headers.location).toBe("/");
    expect(second.headers["set-cookie"]).toBeDefined();
  });

  it("redirects to /?magicError=expired for an expired token", async () => {
    context = await createTestContext();
    const userId = await provisionUser(context, "ext-redirect-expired");

    const { createHash, randomBytes } = await import("node:crypto");
    const plaintext = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    await context.app.db.magicLink.create({
      data: {
        userId,
        token: tokenHash,
        expiresAt: new Date(Date.now() - 60 * 1000),
        next: null,
      },
    });

    const res = await context.app.inject({ method: "GET", url: `/magic?t=${plaintext}` });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/?magicError=expired");
  });
});
