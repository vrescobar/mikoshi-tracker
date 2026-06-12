/**
 * Platform-contract namespace (story 50 of the Mikoshi extensions platform):
 * `POST /api/platform/provision` and `POST /api/platform/issue-magic-link`
 * speak the shapes of ~/projects/mikoshi-stack/docs/contract-summary.md while
 * the legacy `/api/admin/*` aliases keep serving the current Mikoshi runtime
 * until the provision switch (story 54).
 *
 * Contract-vs-legacy differences under test:
 *   - provision input uses `displayName` (legacy: `name`), tolerates `phone`
 *     and `cohorts` without storing them (cohort sync lands in story 51);
 *   - provision response is `{created, userId, personalToken}` and ALWAYS
 *     carries a personal token — rotated on re-provision, which is parity
 *     with the legacy provision-user + reset-token round-trip Mikoshi does
 *     when it re-enrols a user it has no stored secret for.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findUserByApiToken } from "../../src/auth/api-token";
import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-platform";

describe("platform contract namespace", () => {
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

  describe("POST /api/platform/provision", () => {
    it("creates a new user from the contract payload and returns {created: true, userId, personalToken}", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: {
          externalId: "ext-platform-1",
          displayName: "Alice",
          phone: "+34611222333",
          timezone: "Europe/Madrid",
          cohorts: [{ cohortId: "cohort-1", name: "Bikini 2026" }],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        created: true,
        userId: expect.any(String),
        personalToken: expect.stringMatching(/^mikoshi_tracker_/),
      });

      const user = await context.app.db.user.findUnique({ where: { id: body.userId } });
      expect(user?.externalId).toBe("ext-platform-1");
      expect(user?.name).toBe("Alice");
      expect(user?.timezone).toBe("Europe/Madrid");
      // The token in the response resolves to the created user.
      const resolved = await findUserByApiToken(context.app.db, body.personalToken);
      expect(resolved?.id).toBe(body.userId);
    });

    it("re-provision is idempotent on the user and rotates the personal token", async () => {
      context = await createTestContext();

      const first = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-2", displayName: "Bob" },
      });
      expect(first.statusCode).toBe(201);
      const firstBody = first.json();

      const second = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-2", displayName: "Bob" },
      });
      expect(second.statusCode).toBe(200);
      const secondBody = second.json();
      expect(secondBody).toMatchObject({
        created: false,
        userId: firstBody.userId,
        personalToken: expect.stringMatching(/^mikoshi_tracker_/),
      });

      // Rotation: the new token wins, the first one is dead.
      expect(secondBody.personalToken).not.toBe(firstBody.personalToken);
      const resolvedNew = await findUserByApiToken(context.app.db, secondBody.personalToken);
      expect(resolvedNew?.id).toBe(firstBody.userId);
      const resolvedOld = await findUserByApiToken(context.app.db, firstBody.personalToken);
      expect(resolvedOld).toBeNull();
    });

    it("re-provision self-heals a placeholder name and applies timezone, but never clobbers a user-chosen name", async () => {
      context = await createTestContext();

      // Provision without displayName → name falls back to the externalId.
      await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-3" },
      });

      const healed = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-3", displayName: "Carol", timezone: "Asia/Tokyo" },
      });
      expect(healed.statusCode).toBe(200);
      const healedUser = await context.app.db.user.findFirst({
        where: { externalId: "ext-platform-3" },
      });
      expect(healedUser?.name).toBe("Carol");
      expect(healedUser?.timezone).toBe("Asia/Tokyo");

      // A real (user-chosen) name is not overwritten by later provisions.
      await context.app.db.user.update({
        where: { id: healedUser!.id },
        data: { name: "Carolina R." },
      });
      await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-3", displayName: "Carol" },
      });
      const kept = await context.app.db.user.findUnique({ where: { id: healedUser!.id } });
      expect(kept?.name).toBe("Carolina R.");
    });

    it("rejects a missing or wrong admin key with 401 and an unset key with 503", async () => {
      context = await createTestContext();

      const noAuth = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        payload: { externalId: "ext-platform-4" },
      });
      expect(noAuth.statusCode).toBe(401);

      const wrongKey = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: "Bearer not-the-key" },
        payload: { externalId: "ext-platform-4" },
      });
      expect(wrongKey.statusCode).toBe(401);

      delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
      const disabled = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: "Bearer whatever" },
        payload: { externalId: "ext-platform-4" },
      });
      expect(disabled.statusCode).toBe(503);
    });

    it("rejects a payload without externalId with 400", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { displayName: "Nobody" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("keeps the legacy /api/admin/provision-user alias serving the legacy shape", async () => {
      context = await createTestContext();

      // Same user via both namespaces: platform first, then the legacy alias
      // resolves the same row with its legacy response shape.
      const platform = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-5", displayName: "Dave" },
      });
      expect(platform.statusCode).toBe(201);

      const legacy = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-5", name: "Dave" },
      });
      expect(legacy.statusCode).toBe(200);
      expect(legacy.json()).toMatchObject({
        userId: platform.json().userId,
        alreadyExists: true,
      });
    });
  });

  describe("POST /api/platform/issue-magic-link", () => {
    it("issues a magic link with the contract shape {url, expiresAt}", async () => {
      context = await createTestContext();

      await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-6", displayName: "Eve" },
      });

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-6", next: "/circles" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.url).toMatch(/\/magic\?t=/);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("returns 404 for an unknown externalId and 401 without the admin key", async () => {
      context = await createTestContext();

      const unknown = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-nobody" },
      });
      expect(unknown.statusCode).toBe(404);

      const noAuth = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        payload: { externalId: "ext-platform-6" },
      });
      expect(noAuth.statusCode).toBe(401);
    });

    it("rejects an absolute next URL with 400 (anti open-redirect)", async () => {
      context = await createTestContext();

      await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-7" },
      });

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-platform-7", next: "https://evil.example/phish" },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
