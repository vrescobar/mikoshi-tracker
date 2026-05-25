/**
 * Magic-link endpoint tests.
 *
 * Covers the issuance flow (admin-gated) and the consume flow (public,
 * single-use, expiry-bound). The signed cookie payload returned by
 * /api/auth/magic-link/consume is asserted directly so we catch any drift in
 * the better-auth signing scheme reimplementation (apps/api/src/auth/magic-link.ts:
 * signSessionCookieValue).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

describe("magic-link routes", () => {
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

  describe("POST /api/admin/issue-magic-link", () => {
    it("returns 201 with an absolute URL when the user exists", async () => {
      context = await createTestContext();
      await provisionUser(context, "ext-magic-1");

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-magic-1", next: "/food" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { url: string; expiresAt: string };
      // `(auth)` is a Next.js route group and gets stripped from the URL —
      // the page lives at `/magic`, not `/auth/magic`.
      expect(body.url).toMatch(/^http:\/\/127\.0\.0\.1:3001\/magic\?t=[0-9a-f]{64}$/);
      const expires = new Date(body.expiresAt).getTime();
      const now = Date.now();
      // Default TTL is 15 min — accept anywhere in [10, 20) min to absorb test latency.
      expect(expires - now).toBeGreaterThan(10 * 60 * 1000);
      expect(expires - now).toBeLessThan(20 * 60 * 1000);
    });

    it("returns 401 without admin key", async () => {
      context = await createTestContext();
      await provisionUser(context, "ext-magic-noauth");

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        payload: { externalId: "ext-magic-noauth" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for an unknown externalId", async () => {
      context = await createTestContext();

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-never-provisioned" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when `next` is an external URL", async () => {
      context = await createTestContext();
      await provisionUser(context, "ext-magic-bad-next");

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-magic-bad-next", next: "https://evil.example.com/" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/magic-link/consume", () => {
    it("consumes a fresh token and returns a signed session cookie", async () => {
      context = await createTestContext();
      const userId = await provisionUser(context, "ext-consume-1");

      const issueRes = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-consume-1", next: "/food" },
      });
      const url = (issueRes.json() as { url: string }).url;
      const token = new URL(url).searchParams.get("t")!;

      const consumeRes = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token },
      });

      expect(consumeRes.statusCode).toBe(200);
      const body = consumeRes.json() as {
        userId: string;
        next: string;
        cookie: { name: string; value: string; httpOnly: boolean; secure: boolean };
      };
      expect(body.userId).toBe(userId);
      expect(body.next).toBe("/food");
      expect(body.cookie.name).toBe("better-auth.session_token");
      expect(body.cookie.httpOnly).toBe(true);
      // Cookie value has the shape `<token>.<base64sig>` URL-encoded —
      // `.` is preserved by encodeURIComponent so we can match on its presence.
      expect(body.cookie.value).toContain(".");

      // The Session row exists with the same token (URL-encoded form removed).
      const decoded = decodeURIComponent(body.cookie.value);
      const sessionToken = decoded.split(".")[0]!;
      const session = await context.app.db.session.findUnique({
        where: { token: sessionToken },
      });
      expect(session).not.toBeNull();
      expect(session?.userId).toBe(userId);
    });

    it("returns 410 Gone on second consume of the same token (single-use)", async () => {
      context = await createTestContext();
      await provisionUser(context, "ext-single-use");

      const issueRes = await context.app.inject({
        method: "POST",
        url: "/api/admin/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-single-use" },
      });
      const token = new URL((issueRes.json() as { url: string }).url).searchParams.get("t")!;

      const first = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token },
      });
      expect(first.statusCode).toBe(200);

      const second = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token },
      });
      expect(second.statusCode).toBe(410);
      expect((second.json() as { code: string }).code).toBe("GONE");
    });

    it("returns 410 Gone for an expired token", async () => {
      context = await createTestContext();
      const userId = await provisionUser(context, "ext-expired");

      // Insert a MagicLink row with expiresAt in the past, bypassing the
      // issuance endpoint so we don't have to wait or stub timers.
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

      const res = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token: plaintext },
      });
      expect(res.statusCode).toBe(410);
    });

    it("returns 404 for an unknown token", async () => {
      context = await createTestContext();

      const res = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token: "not-a-real-token-just-random-bytes-deadbeef" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when token field is missing", async () => {
      context = await createTestContext();

      const res = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
