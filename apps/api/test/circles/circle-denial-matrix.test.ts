import { afterEach, describe, expect, it } from "bun:test";

import { createCircleToken } from "../../src/auth/circle-token";
import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import {
  addCircleMemberRecord,
  createCircleHabitShareRecord,
  createCircleRecord,
} from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const NOW = "2026-05-18T12:00:00.000Z";

async function buildFixture(context: TestContext) {
  const { body: alice } = await signUp(context.app, { email: "alice@example.com", name: "Alice" });
  const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

  const circle = await createCircleRecord(context.app.db, {
    ownerId: alice.user.id,
    name: "Test Circle",
  });
  await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });
  const { token } = await createCircleToken(context.app.db, circle.id);

  const aliceHabit = await createHabit(
    { db: context.app.db },
    {
      userId: alice.user.id,
      input: { name: "Alice habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
      today: "2026-05-18",
    },
  );
  const bobHabit = await createHabit(
    { db: context.app.db },
    {
      userId: bob.user.id,
      input: { name: "Bob habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
      today: "2026-05-18",
    },
  );

  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: aliceHabit.id });
  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: bobHabit.id });

  return { alice: alice.user, bob: bob.user, circle, token, aliceHabit, bobHabit };
}

describe("circle-token denial matrix (§C14)", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  // §C14.1 — Circle-A token on circle B's :circleId → 403
  it("cross-circle token on a write endpoint returns 403", async () => {
    context = await createTestContext();
    const { alice, circle, aliceHabit } = await buildFixture(context);

    const otherCircle = await createCircleRecord(context.app.db, {
      ownerId: alice.id,
      name: "Other Circle",
    });
    const { token: otherToken } = await createCircleToken(context.app.db, otherCircle.id);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/complete`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // §C14.2 — Write against a userId not a member of the circle → 404
  it("write against a userId not in the circle returns 404", async () => {
    context = await createTestContext();
    const { circle, token } = await buildFixture(context);

    const { body: carol } = await signUp(context.app, { email: "carol@example.com", name: "Carol" });
    const carolHabit = await createHabit(
      { db: context.app.db },
      {
        userId: carol.user.id,
        input: { name: "Carol habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
        today: "2026-05-18",
      },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${carol.user.id}/habits/${carolHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // §C14.3 — Write against a habitId that exists but belongs to a different userId → 404
  // Alice and Bob are both members; aliceHabit is shared; but Bob is in the URL.
  // The server must 404 — it must not reveal that Alice owns the habit.
  it("write against a habitId that belongs to another member returns 404", async () => {
    context = await createTestContext();
    const { bob, circle, token, aliceHabit } = await buildFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${bob.id}/habits/${aliceHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // §C14.4 — Write against a member's habit not shared in the circle → 403
  it("write against a member's habit not in CircleHabitShare returns 403", async () => {
    context = await createTestContext();
    const { alice, circle, token } = await buildFixture(context);

    const unsharedHabit = await createHabit(
      { db: context.app.db },
      {
        userId: alice.id,
        input: { name: "Private habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
        today: "2026-05-18",
      },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${unsharedHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // §C14.5 — Write against an archived habit → 409 HABIT_INACTIVE
  it("write against an archived habit returns 409 HABIT_INACTIVE", async () => {
    context = await createTestContext();
    const { alice, circle, token, aliceHabit } = await buildFixture(context);

    await context.app.db.entry.update({
      where: { id: aliceHabit.id },
      data: { isActive: false },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "HABIT_INACTIVE" });
  });

  // §C14.6 — Happy path: CheckInMutation source="circle" is reflected in the leaderboard
  it("happy path: circle check-in records source:CIRCLE and the leaderboard completedTodayCount increments", async () => {
    context = await createTestContext();
    const { alice, circle, token, aliceHabit } = await buildFixture(context);

    const beforeRes = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/leaderboard`,
      headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
    });
    expect(beforeRes.statusCode).toBe(200);
    const beforeBoard = beforeRes.json() as { leaderboard: Array<{ userId: string; completedTodayCount: number }> };
    expect(beforeBoard.leaderboard.find((e) => e.userId === alice.id)!.completedTodayCount).toBe(0);

    const completeRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
    });
    expect(completeRes.statusCode).toBe(200);

    const mutation = await context.app.db.eventMutation.findFirst({
      where: { entryId: aliceHabit.id },
      orderBy: { createdAt: "desc" },
    });
    expect(mutation?.source).toBe("CIRCLE");
    expect(mutation?.type).toBe("CREATE");

    const afterRes = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/leaderboard`,
      headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
    });
    expect(afterRes.statusCode).toBe(200);
    const afterBoard = afterRes.json() as { leaderboard: Array<{ userId: string; completedTodayCount: number }> };
    expect(afterBoard.leaderboard.find((e) => e.userId === alice.id)!.completedTodayCount).toBe(1);
  });

  // §C14.7 — GET /members/:userId/habits never includes an un-shared habit
  it("GET /members/:userId/habits never leaks un-shared habits", async () => {
    context = await createTestContext();
    const { alice, circle, token } = await buildFixture(context);

    const unsharedHabit = await createHabit(
      { db: context.app.db },
      {
        userId: alice.id,
        input: { name: "Secret habit", frequency: { type: "daily" }, startDate: "2026-05-01" },
        today: "2026-05-18",
      },
    );

    const response = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits`,
      headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
    });

    expect(response.statusCode).toBe(200);
    const { habits } = response.json() as { habits: Array<{ habitId: string }> };
    expect(habits.map((h) => h.habitId)).not.toContain(unsharedHabit.id);
  });

  // §C14.9 — Undo over a web-sourced mutation → 409, mutation untouched
  it("circle undo over a web-sourced mutation returns 409 UNDO_NOT_CIRCLE_SOURCED with mutation untouched", async () => {
    context = await createTestContext();
    const { alice, circle, token, aliceHabit } = await buildFixture(context);

    await completeHabitForToday(
      { db: context.app.db },
      { userId: alice.id, habitId: aliceHabit.id, source: "web", timestamp: NOW },
    );

    const mutationBefore = await context.app.db.eventMutation.findFirst({
      where: { entryId: aliceHabit.id },
      orderBy: { createdAt: "desc" },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/undo`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "UNDO_NOT_CIRCLE_SOURCED" });

    const mutationAfter = await context.app.db.eventMutation.findFirst({
      where: { entryId: aliceHabit.id },
      orderBy: { createdAt: "desc" },
    });
    expect(mutationAfter?.id).toBe(mutationBefore?.id);
    expect(mutationAfter?.source).toBe("WEB");
  });

  // §C14.9 — Undo over a circle-sourced mutation → 200, state reverted
  it("circle undo over a circle-sourced mutation returns 200 and reverts completed state", async () => {
    context = await createTestContext();
    const { alice, circle, token, aliceHabit } = await buildFixture(context);

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${alice.id}/habits/${aliceHabit.id}/undo`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      habitId: aliceHabit.id,
      userId: alice.id,
      completed: false,
    });
  });
});
