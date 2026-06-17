import { afterEach, describe, expect, it } from "bun:test";

import { addCircleMemberRecord, createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("management authorization matrix (§C14.8)", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  // ── Token minting — owner-only ────────────────────────────────────────────────

  it("non-owner member gets 403 when minting a circle token", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
    await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/tokens`,
      headers: { cookie: bobCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Member management — owner-only ───────────────────────────────────────────

  it("non-owner member gets 403 when adding a member", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
    await signUp(context.app, { email: "carol@example.com", name: "Carol" });

    const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
    await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members`,
      headers: { cookie: bobCookie },
      payload: { email: "carol@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Habit sharing — members may only share their own habits ──────────────────

  // A member (Bob) attempts to share another member's (Alice's) habit.
  // The server must respond 404 regardless of whether the habit is shared in the
  // circle — revealing that the habit exists but belongs to someone else would
  // leak information.
  it("member gets 404 when sharing a habit that belongs to another circle member", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
    await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

    const aliceHabit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      {
        userId: alice.user.id,
        input: { name: "Alice's habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
        today: "2026-05-18",
      },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/shares`,
      headers: { cookie: bobCookie },
      payload: { habitId: aliceHabit.id },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // A user who is NOT a circle member tries to share their own habit.
  // The server must respond 403 before checking habit ownership.
  it("non-member gets 403 when attempting to share a habit into a circle", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });

    const bobHabit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      {
        userId: bob.user.id,
        input: { name: "Bob's own habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
        today: "2026-05-18",
      },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/shares`,
      headers: { cookie: bobCookie },
      payload: { habitId: bobHabit.id },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // A member tries to share a non-existent habit ID.  The server must respond 404
  // and reveal no information about the existence of other users' habits.
  it("member gets 404 when sharing a habit that does not exist", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
    await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/shares`,
      headers: { cookie: bobCookie },
      payload: { habitId: "nonexistent-habit-id" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});
