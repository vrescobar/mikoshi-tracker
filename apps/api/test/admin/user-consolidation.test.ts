import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  addCircleMemberRecord,
  createCircleRecord,
} from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

async function provision(context: TestContext, externalId: string, name = externalId) {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/provision-user",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, name },
  });
  return res.json() as { userId: string; personalToken: string };
}

describe("admin user consolidation", () => {
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

  describe("POST /api/admin/users/merge", () => {
    it("folds the provisioned source into the web target: re-parents data, moves externalId, deletes source", async () => {
      context = await createTestContext();
      const db = context.app.db;

      // Target = web account (real email, no externalId).
      const { body: web } = await signUp(context.app, { email: "victor@vrescobar.com", name: "Victor" });
      const targetId = web.user.id;

      // Source = provisioned account (synthetic email, externalId + token), owns a circle + a habit.
      const source = await provision(context, "ext-victor", "924521e6");
      const habit = await createHabit(
        { db },
        { userId: source.userId, input: { name: "Correr", frequency: { type: "daily" } }, today: "2026-05-01" },
      );
      // createCircleRecord auto-creates the owner's membership, so the source
      // is already a member of this circle.
      const circle = await createCircleRecord(db, { ownerId: source.userId, name: "Bikini" });

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/merge",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { sourceUserId: source.userId, targetUserId: targetId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.targetUserId).toBe(targetId);
      expect(body.movedExternalId).toBe("ext-victor");
      expect(body.reparented.entries).toBeGreaterThanOrEqual(1);
      expect(body.reparented.circlesOwned).toBe(1);
      expect(body.reparented.circleMemberships).toBe(1);
      expect(body.reparented.apiTokenMoved).toBe(true);

      // Source row is gone; target absorbed everything.
      expect(await db.user.findUnique({ where: { id: source.userId } })).toBeNull();
      const target = await db.user.findUnique({ where: { id: targetId } });
      expect(target?.externalId).toBe("ext-victor");
      expect((await db.circle.findUnique({ where: { id: circle.id } }))?.ownerId).toBe(targetId);
      expect((await db.entry.findUnique({ where: { id: habit.id } }))?.userId).toBe(targetId);
      expect((await db.apiToken.findUnique({ where: { userId: targetId } }))).not.toBeNull();

      // The skill's stored personal token now authenticates as the target.
      const habits = await context.app.inject({
        method: "GET",
        url: "/api/habits",
        headers: { authorization: `Bearer ${source.personalToken}` },
      });
      expect(habits.statusCode).toBe(200);
      expect(habits.json().items.map((h: { name: string }) => h.name)).toContain("Correr");
    });

    it("de-dups circle memberships when both users are in the same circle", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const { body: web } = await signUp(context.app, { email: "w@example.com" });
      const source = await provision(context, "ext-dup");
      // web is auto-enrolled as owner-member; add the source as a second member.
      const circle = await createCircleRecord(db, { ownerId: web.user.id, name: "Shared" });
      await addCircleMemberRecord(db, { circleId: circle.id, userId: source.userId, externalId: "ext-dup" });

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/merge",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { sourceUserId: source.userId, targetUserId: web.user.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().reparented.circleMembershipsDeduped).toBe(1);
      // Target keeps a single membership in that circle, now carrying the externalId.
      const memberships = await db.circleMembership.findMany({ where: { circleId: circle.id } });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]!.userId).toBe(web.user.id);
      expect(memberships[0]!.externalId).toBe("ext-dup");
    });

    it("rejects merging a user into itself (400)", async () => {
      context = await createTestContext();
      const { body: web } = await signUp(context.app);
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/merge",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { sourceUserId: web.user.id, targetUserId: web.user.id },
      });
      expect(res.statusCode).toBe(400);
    });

    it("404 when a user does not exist", async () => {
      context = await createTestContext();
      const { body: web } = await signUp(context.app);
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/merge",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { sourceUserId: "nope", targetUserId: web.user.id },
      });
      expect(res.statusCode).toBe(404);
    });

    it("401 without the admin key", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/merge",
        payload: { sourceUserId: "a", targetUserId: "b" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/admin/users/attach-external-id", () => {
    it("attaches an externalId to a web account", async () => {
      context = await createTestContext();
      const { body: web } = await signUp(context.app);
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/attach-external-id",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { userId: web.user.id, externalId: "ext-attach" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ externalId: "ext-attach", previousExternalId: null });
      const user = await context.app.db.user.findUnique({ where: { id: web.user.id } });
      expect(user?.externalId).toBe("ext-attach");
    });

    it("409 when the user already has a different externalId (without force)", async () => {
      context = await createTestContext();
      const src = await provision(context, "ext-existing");
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/attach-external-id",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { userId: src.userId, externalId: "ext-other" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("409 when the externalId is already taken by another user", async () => {
      context = await createTestContext();
      await provision(context, "ext-taken");
      const { body: web } = await signUp(context.app);
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/users/attach-external-id",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { userId: web.user.id, externalId: "ext-taken" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("POST /api/admin/login-as", () => {
    it("issues a single-use login link for any user that logs them in on consume", async () => {
      context = await createTestContext();
      const { body: web } = await signUp(context.app);

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/login-as",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { userId: web.user.id },
      });
      expect(res.statusCode).toBe(201);
      const { url, userId } = res.json() as { url: string; userId: string };
      expect(userId).toBe(web.user.id);
      const token = new URL(url).searchParams.get("t");
      expect(token).toBeTruthy();

      const consume = await context.app.inject({
        method: "POST",
        url: "/api/auth/magic-link/consume",
        payload: { token },
      });
      expect(consume.statusCode).toBe(200);
      expect(consume.json().userId).toBe(web.user.id);
    });

    it("404 for an unknown user", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/login-as",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { userId: "does-not-exist" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
