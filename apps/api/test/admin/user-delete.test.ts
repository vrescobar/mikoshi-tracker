import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

describe("DELETE /api/admin/users/:userId", () => {
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

  it("returns 401 when admin key is missing", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/admin/users/some-user-id",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 401 when admin key is wrong", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/admin/users/some-user-id",
      headers: { authorization: "Bearer wrong-key" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 404 for an unknown userId", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/admin/users/nonexistent-user-id",
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes the user and all cascaded records on successful deletion", async () => {
    context = await createTestContext();

    // Provision a user
    const provisionRes = await context.app.inject({
      method: "POST",
      url: "/api/admin/provision-user",
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: { externalId: "ext-delete-test-1", name: "DeleteMe" },
    });
    expect(provisionRes.statusCode).toBe(201);
    const userId = (provisionRes.json() as { userId: string }).userId;

    // Create a circle owned by the provisioned user (we need to sign up a different user first)
    const { body: owner } = await signUp(context.app);

    // Delete the provisioned user — they have no circles/entries, so basic deletion test
    const deleteRes = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/users/${userId}`,
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });

    expect(deleteRes.statusCode).toBe(204);

    // Verify the user no longer exists
    const user = await context.app.db.user.findUnique({
      where: { id: userId },
    });
    expect(user).toBeNull();
  });

  it("cascades deletion to Entry records", async () => {
    context = await createTestContext();

    // Provision a user
    const provisionRes = await context.app.inject({
      method: "POST",
      url: "/api/admin/provision-user",
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: { externalId: "ext-delete-cascade-1", name: "CascadeMe" },
    });
    expect(provisionRes.statusCode).toBe(201);
    const userId = (provisionRes.json() as { userId: string }).userId;

    // Insert an entry directly into the DB (cascade FK test)
    const habitTypeId = context.app.sqlite
      .get<{ id: string }>(`SELECT "id" FROM "EntryType" WHERE "slug" = ?`, ["habit_boolean"])
      ?.id as string;
    const entryId = `entry_del_test_${Date.now()}`;
    context.app.sqlite.run(
      `INSERT INTO "Entry" ("id", "userId", "entryTypeId", "name", "config", "startDate", "isActive", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, '{}', datetime('now'), 1, datetime('now'), datetime('now'))`,
      [entryId, userId, habitTypeId, "Test Habit to Delete"],
    );

    // Verify entry exists before deletion
    const entryBefore = await context.app.db.entry.findUnique({
      where: { id: entryId },
    });
    expect(entryBefore).not.toBeNull();

    // Delete the user
    const deleteRes = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/users/${userId}`,
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify entry was cascade-deleted
    const entryAfter = await context.app.db.entry.findUnique({
      where: { id: entryId },
    });
    expect(entryAfter).toBeNull();
  });

  it("cascades deletion to CircleMembership records", async () => {
    context = await createTestContext();

    // Provision a user
    const provisionRes = await context.app.inject({
      method: "POST",
      url: "/api/admin/provision-user",
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: { externalId: "ext-delete-membership-1", name: "MemberMe" },
    });
    expect(provisionRes.statusCode).toBe(201);

    // Create a circle owned by a real user
    const { body: owner } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.sqlite, {
      ownerId: owner.user.id,
      name: "Test Circle Delete",
    });

    // Enrol the provisioned user into the circle
    const enrolRes = await context.app.inject({
      method: "POST",
      url: `/api/admin/circles/${circle.id}/members`,
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: { externalId: "ext-delete-membership-1" },
    });
    expect(enrolRes.statusCode).toBe(201);
    const membershipId = (enrolRes.json() as { membershipId: string }).membershipId;

    // Verify membership exists before deletion
    const membershipBefore = await context.app.db.circleMembership.findUnique({
      where: { id: membershipId },
    });
    expect(membershipBefore).not.toBeNull();

    // Delete the provisioned user
    const userId = (provisionRes.json() as { userId: string }).userId;
    const deleteRes = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/users/${userId}`,
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify membership was cascade-deleted
    const membershipAfter = await context.app.db.circleMembership.findUnique({
      where: { id: membershipId },
    });
    expect(membershipAfter).toBeNull();

    // Circle should still exist (owned by another user)
    const circleCount = await context.app.db.circle.count({
      where: { id: circle.id },
    });
    expect(circleCount).toBeGreaterThan(0);
  });
});
