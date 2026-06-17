import { afterEach, describe, expect, it } from "bun:test";

import { createCircleToken } from "../../src/auth/circle-token";
import { addCircleMemberRecord, createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

async function setupFixture(context: TestContext) {
  const { body: owner } = await signUp(context.app, { email: "owner@example.com", name: "Owner" });
  // Simulate an auto-provisioned member whose name is a raw UUID.
  const { body: member } = await signUp(context.app, {
    email: "member@example.com",
    name: "750b55db-c536-4338-a241-120d1adbca63",
  });

  const circle = await createCircleRecord(context.app.sqlite, { ownerId: owner.user.id, name: "Test Circle" });
  await addCircleMemberRecord(context.app.sqlite, { circleId: circle.id, userId: member.user.id });
  const { token } = await createCircleToken(context.app.sqlite, circle.id);

  return { owner: owner.user, member: member.user, circle, token };
}

describe("circle member rename", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("renames a member and the new name shows in leaderboard and members list", async () => {
    context = await createTestContext();
    const { member, circle, token } = await setupFixture(context);

    const rename = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circle.id}/members/${member.id}/name`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Dani" },
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json()).toMatchObject({ membership: { userId: member.id, displayName: "Dani" } });

    const members = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/members`,
      headers: { authorization: `Bearer ${token}` },
    });
    const memberRow = (members.json() as { members: Array<{ userId: string; displayName: string }> }).members.find(
      (m) => m.userId === member.id,
    );
    expect(memberRow?.displayName).toBe("Dani");

    const leaderboard = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/leaderboard`,
      headers: { authorization: `Bearer ${token}` },
    });
    const lbRow = (leaderboard.json() as { leaderboard: Array<{ userId: string; displayName: string }> }).leaderboard.find(
      (r) => r.userId === member.id,
    );
    expect(lbRow?.displayName).toBe("Dani");
  });

  it("returns 404 for a user that is not a member of this circle", async () => {
    context = await createTestContext();
    const { circle, token } = await setupFixture(context);
    const { body: stranger } = await signUp(context.app, { email: "stranger@example.com", name: "Stranger" });

    const rename = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circle.id}/members/${stranger.user.id}/name`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Nope" },
    });
    expect(rename.statusCode).toBe(404);
    // The stranger's global name must be untouched.
    const after = await context.app.db.user.findUnique({ where: { id: stranger.user.id }, select: { name: true } });
    expect(after?.name).toBe("Stranger");
  });

  it("rejects an empty or oversized name (400)", async () => {
    context = await createTestContext();
    const { member, circle, token } = await setupFixture(context);

    const empty = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circle.id}/members/${member.id}/name`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const tooLong = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circle.id}/members/${member.id}/name`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "x".repeat(61) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it("requires a valid circle token", async () => {
    context = await createTestContext();
    const { member, circle } = await setupFixture(context);

    const rename = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circle.id}/members/${member.id}/name`,
      headers: { authorization: `Bearer mikoshi_tracker_circle_invalid` },
      payload: { name: "Dani" },
    });
    expect(rename.statusCode).toBe(401);
  });
});
