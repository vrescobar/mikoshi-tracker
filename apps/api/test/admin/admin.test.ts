import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

describe("admin provisioning routes", () => {
  let context: TestContext | undefined;

  beforeEach(() => {
    process.env.HAAABIT_ADMIN_API_KEY = ADMIN_KEY;
  });

  afterEach(async () => {
    delete process.env.HAAABIT_ADMIN_API_KEY;
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  describe("POST /api/admin/provision-user", () => {
    it("creates a new user and returns 201 with personalToken and alreadyExists: false", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-new-user-1", name: "Alice", timezone: "Europe/Madrid" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        alreadyExists: false,
        personalToken: expect.stringMatching(/^haaabit_/),
        userId: expect.any(String),
      });

      const user = await context.app.db.user.findUnique({
        where: { id: body.userId },
      });
      expect(user).not.toBeNull();
      expect(user?.email).toMatch(/^provisioned-[0-9a-f]{24}@haaabit\.internal$/);
      expect(user?.emailVerified).toBe(true);
      expect(user?.externalId).toBe("ext-new-user-1");
    });

    it("returns 200 with alreadyExists: true and no token on repeated call with same externalId", async () => {
      context = await createTestContext();

      const first = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-idempotent-1" },
      });
      expect(first.statusCode).toBe(201);
      const firstBody = first.json() as { userId: string };

      const second = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-idempotent-1" },
      });
      expect(second.statusCode).toBe(200);
      const secondBody = second.json();
      expect(secondBody).toMatchObject({
        userId: firstBody.userId,
        alreadyExists: true,
      });
      expect(secondBody).not.toHaveProperty("personalToken");
    });

    it("returns 401 when admin key is missing", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        payload: { externalId: "ext-no-key" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 401 when admin key is wrong", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: "Bearer wrong-key" },
        payload: { externalId: "ext-wrong-key" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 503 when HAAABIT_ADMIN_API_KEY is not set", async () => {
      delete process.env.HAAABIT_ADMIN_API_KEY;
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-no-env" },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    });

    it("returns 400 when externalId is missing", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns 400 when externalId is empty string", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("falls back to DEFAULT_TIMEZONE for an invalid timezone string", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-bad-tz", timezone: "Not/AReal_Timezone" },
      });

      expect(response.statusCode).toBe(201);
      const user = await context.app.db.user.findUnique({
        where: { id: (response.json() as { userId: string }).userId },
      });
      expect(user?.timezone).toBe("Asia/Shanghai");
    });
  });

  describe("POST /api/admin/circles/:circleId/members", () => {
    it("creates a new membership and returns 201 with membershipId, userId, externalId", async () => {
      context = await createTestContext();

      const provisionRes = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-new-1" },
      });
      expect(provisionRes.statusCode).toBe(201);
      const { userId } = provisionRes.json() as { userId: string };

      const { body: owner } = await signUp(context.app);
      const circle = await createCircleRecord(context.app.db, {
        ownerId: owner.user.id,
        name: "Test Circle",
      });

      const res = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-new-1" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        membershipId: expect.any(String),
        userId,
        externalId: "ext-enrol-new-1",
      });
    });

    it("re-enrolling an already-member user returns 200 with the existing membership", async () => {
      context = await createTestContext();

      await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-idempotent-1" },
      });

      const { body: owner } = await signUp(context.app);
      const circle = await createCircleRecord(context.app.db, {
        ownerId: owner.user.id,
        name: "Test Circle",
      });

      const first = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-idempotent-1" },
      });
      expect(first.statusCode).toBe(201);
      const { membershipId } = first.json() as { membershipId: string };

      const second = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-idempotent-1" },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ membershipId });
    });

    it("returns 404 for an unknown externalId", async () => {
      context = await createTestContext();

      const { body: owner } = await signUp(context.app);
      const circle = await createCircleRecord(context.app.db, {
        ownerId: owner.user.id,
        name: "Test Circle",
      });

      const res = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-does-not-exist" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns 404 for an unknown circleId", async () => {
      context = await createTestContext();

      await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-bad-circle-1" },
      });

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles/nonexistent-circle-id/members",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-enrol-bad-circle-1" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns 400 when externalId is missing", async () => {
      context = await createTestContext();

      const { body: owner } = await signUp(context.app);
      const circle = await createCircleRecord(context.app.db, {
        ownerId: owner.user.id,
        name: "Test Circle",
      });

      const res = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns 400 when externalId is empty string", async () => {
      context = await createTestContext();

      const { body: owner } = await signUp(context.app);
      const circle = await createCircleRecord(context.app.db, {
        ownerId: owner.user.id,
        name: "Test Circle",
      });

      const res = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns 401 when admin key is missing", async () => {
      context = await createTestContext();

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles/some-circle-id/members",
        payload: { externalId: "ext-no-key" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 401 when admin key is wrong", async () => {
      context = await createTestContext();

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles/some-circle-id/members",
        headers: { authorization: "Bearer wrong-key" },
        payload: { externalId: "ext-wrong-key" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("POST /api/admin/provision-user/reset-token", () => {
    it("rotates the token for a known externalId and returns a new token", async () => {
      context = await createTestContext();

      const provisionResponse = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-reset-token-1" },
      });
      expect(provisionResponse.statusCode).toBe(201);
      const firstToken = (provisionResponse.json() as { personalToken: string }).personalToken;

      const resetResponse = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user/reset-token",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-reset-token-1" },
      });

      expect(resetResponse.statusCode).toBe(200);
      const resetBody = resetResponse.json() as { userId: string; personalToken: string };
      expect(resetBody.personalToken).toMatch(/^haaabit_/);
      expect(resetBody.personalToken).not.toBe(firstToken);
    });

    it("returns 404 for an unknown externalId", async () => {
      context = await createTestContext();

      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/provision-user/reset-token",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-does-not-exist" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
