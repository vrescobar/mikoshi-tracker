/**
 * Session-admin operator tests.
 *
 * resolveAdminOperator() accepts a better-auth session cookie whose user has
 * the isAdmin flag, alongside the bearer credentials (root key / AdminToken).
 * The bearer path keeps its exact pre-session error contract — the Mikoshi
 * bot authenticates with bearer keys and relies on the 200/401/503 semantics.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

async function promoteToAdmin(context: TestContext, cookie: string): Promise<void> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/test/session/promote-admin",
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
}

describe("admin session operator", () => {
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

  describe("bearer contract (unchanged for the Mikoshi bot)", () => {
    it("valid root key still provisions (201)", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-bearer-contract" },
      });
      expect(res.statusCode).toBe(201);
    });

    it("wrong bearer → 401 'Invalid admin API key'", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: "Bearer wrong-key" },
        payload: { externalId: "x" },
      });
      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toBe("Invalid admin API key");
    });

    it("no credential at all → 401 'Admin API key required'", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        payload: { externalId: "x" },
      });
      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toBe("Admin API key required");
    });

    it("bearer present but root key unset → 503 (feature disabled)", async () => {
      delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "x" },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe("session path", () => {
    it("an admin session can call legacy /api/admin/* without a bearer", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app, { email: "boss@example.com" });
      await promoteToAdmin(context, cookie);

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { cookie },
        payload: { externalId: "ext-session-admin" },
      });

      expect(res.statusCode).toBe(201);
    });

    it("an admin session can call v1 admin-key routes", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app, { email: "boss2@example.com" });
      await promoteToAdmin(context, cookie);

      const res = await context.app.inject({
        method: "GET",
        url: "/api/v1/admin/users",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { ok: boolean }).ok).toBe(true);
    });

    it("a non-admin session is rejected with 401", async () => {
      context = await createTestContext();
      // First sign-up becomes admin automatically; the second one does not.
      await signUp(context.app, { email: "first@example.com" });
      const { cookie } = await signUp(context.app, { email: "second@example.com" });

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { cookie },
        payload: { externalId: "x" },
      });

      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toBe("Admin API key required");
    });

    it("an admin session works even when the root key is unset", async () => {
      delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
      context = await createTestContext();
      const { cookie } = await signUp(context.app, { email: "keyless@example.com" });
      await promoteToAdmin(context, cookie);

      const res = await context.app.inject({
        method: "GET",
        url: "/api/v1/admin/users",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
    });

    it("audited mutations attribute actorType 'session' with the user id", async () => {
      context = await createTestContext();
      const { cookie, body } = await signUp(context.app, { email: "auditor@example.com" });
      await promoteToAdmin(context, cookie);

      const mint = await context.app.inject({
        method: "POST",
        url: "/api/v1/admin/tokens/mint",
        headers: { cookie },
        payload: { label: "session-minted-bot" },
      });
      expect(mint.statusCode).toBe(201);

      const row = await context.app.db.adminAuditLog.findFirst({
        where: { action: "admin_token.mint" },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.actorType).toBe("session");
      expect(row?.actorId).toBe(body.user.id);
      expect(row?.actorLabel).toBe(body.user.name);
    });
  });
});
