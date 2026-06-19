import { afterEach, describe, expect, it } from "bun:test";

import { createCircleToken } from "../../src/auth/circle-token";
import {
  addCircleMemberRecord,
  createCircleRecord,
  updateCircleLifecycle,
} from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

/**
 * A `disabled` circle is the "switched off" state: hidden from every member's
 * list, 404 on direct access (web session AND circle token), and rejecting all
 * check-ins. Setting it back to `active` fully restores it.
 */
describe("disabled circle (hidden + off for all members)", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("disappears from GET /api/circles for the owner and every member", async () => {
    context = await createTestContext();
    const { body: alice, cookie: aliceCookie } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, {
      email: "bob@example.com",
      name: "Bob",
    });

    const circle = await createCircleRecord(context.app.sqlite, { ownerId: alice.user.id, name: "Concurso" });
    await addCircleMemberRecord(context.app.sqlite, { circleId: circle.id, userId: bob.user.id });

    // Visible to both while active.
    const beforeOwner = await context.app.inject({ method: "GET", url: "/api/circles", headers: { cookie: aliceCookie } });
    expect(beforeOwner.json().items).toHaveLength(1);
    const beforeMember = await context.app.inject({ method: "GET", url: "/api/circles", headers: { cookie: bobCookie } });
    expect(beforeMember.json().items).toHaveLength(1);

    await updateCircleLifecycle(context.app.sqlite, circle.id, { status: "disabled" });

    // Gone from both lists.
    const afterOwner = await context.app.inject({ method: "GET", url: "/api/circles", headers: { cookie: aliceCookie } });
    expect(afterOwner.statusCode).toBe(200);
    expect(afterOwner.json().items).toHaveLength(0);

    const afterMember = await context.app.inject({ method: "GET", url: "/api/circles", headers: { cookie: bobCookie } });
    expect(afterMember.statusCode).toBe(200);
    expect(afterMember.json().items).toHaveLength(0);
  });

  it("returns 404 on GET /api/circles/:id even for its own members", async () => {
    context = await createTestContext();
    const { body: alice, cookie: aliceCookie } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circle = await createCircleRecord(context.app.sqlite, { ownerId: alice.user.id, name: "Concurso" });
    await addCircleMemberRecord(context.app.sqlite, { circleId: circle.id, userId: bob.user.id });
    await updateCircleLifecycle(context.app.sqlite, circle.id, { status: "disabled" });

    for (const cookie of [aliceCookie, bobCookie]) {
      const res = await context.app.inject({ method: "GET", url: `/api/circles/${circle.id}`, headers: { cookie } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("rejects circle-token reads and writes with 404 CIRCLE_DISABLED", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.sqlite, { ownerId: alice.user.id, name: "Concurso" });
    const { token } = await createCircleToken(context.app.sqlite, circle.id, "bot");

    // Works while active.
    const live = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/leaderboard`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(live.statusCode).toBe(200);

    await updateCircleLifecycle(context.app.sqlite, circle.id, { status: "disabled" });

    const board = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/leaderboard`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(board.statusCode).toBe(404);
    expect(board.json()).toMatchObject({ code: "CIRCLE_DISABLED" });

    // Writes are blocked at the same chokepoint, before any habit lookup.
    const write = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.user.id}/habits/any-habit/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(write.statusCode).toBe(404);
    expect(write.json()).toMatchObject({ code: "CIRCLE_DISABLED" });
  });

  it("re-enabling (status active) fully restores visibility and access", async () => {
    context = await createTestContext();
    const { body: alice, cookie: aliceCookie } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.sqlite, { ownerId: alice.user.id, name: "Concurso" });

    await updateCircleLifecycle(context.app.sqlite, circle.id, { status: "disabled" });
    await updateCircleLifecycle(context.app.sqlite, circle.id, { status: "active" });

    const list = await context.app.inject({ method: "GET", url: "/api/circles", headers: { cookie: aliceCookie } });
    expect(list.json().items).toHaveLength(1);

    const detail = await context.app.inject({ method: "GET", url: `/api/circles/${circle.id}`, headers: { cookie: aliceCookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().circle.id).toBe(circle.id);
  });
});
