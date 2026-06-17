import { afterEach, describe, expect, it } from "bun:test";

import { createCircleToken } from "../../src/auth/circle-token";
import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import { createCircleHabitShareRecord, createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const TIMESTAMP = "2026-05-18T12:00:00.000Z";

async function setupCircleFixture(context: TestContext) {
  const { body: alice } = await signUp(context.app);
  const userId = alice.user.id;

  const circle = await createCircleRecord(context.app.db, {
    ownerId: userId,
    name: "Test Circle",
  });

  const { token } = await createCircleToken(context.app.db, circle.id);

  const booleanHabit = await createHabit(
    { db: context.app.db, sqlite: context.app.sqlite },
    { userId, input: { name: "Morning run", frequency: { type: "daily" } }, today: "2026-05-01" },
  );

  const quantityHabit = await createHabit(
    { db: context.app.db, sqlite: context.app.sqlite },
    {
      userId,
      input: { name: "Read pages", kind: "quantity", targetValue: 20, unit: "pages", frequency: { type: "daily" } },
      today: "2026-05-01",
    },
  );

  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: booleanHabit.id });
  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: quantityHabit.id });

  return { userId, circle, token, booleanHabit, quantityHabit };
}

describe("circle write endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("complete on a boolean habit returns 200 with completed:true and persists a CIRCLE-sourced mutation", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      habitId: booleanHabit.id,
      userId,
      completed: true,
      currentValue: null,
    });

    const mutation = await context.app.db.eventMutation.findFirst({
      where: { entryId: booleanHabit.id },
      orderBy: { createdAt: "desc" },
    });
    expect(mutation?.source).toBe("CIRCLE");
    expect(mutation?.type).toBe("CREATE");
  });

  it("set-total on a quantity habit returns 200 with updated value", async () => {
    context = await createTestContext();
    const { userId, circle, token, quantityHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${quantityHabit.id}/set-total`,
      headers: { authorization: `Bearer ${token}` },
      payload: { total: 15 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      habitId: quantityHabit.id,
      userId,
      completed: false,
      currentValue: 15,
    });

    const mutation = await context.app.db.eventMutation.findFirst({
      where: { entryId: quantityHabit.id },
      orderBy: { createdAt: "desc" },
    });
    expect(mutation?.source).toBe("CIRCLE");
    expect(mutation?.type).toBe("CREATE");
  });

  it("complete on a quantity habit returns 400 (kind mismatch)", async () => {
    context = await createTestContext();
    const { userId, circle, token, quantityHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${quantityHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("set-total on a boolean habit returns 400 (kind mismatch)", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/set-total`,
      headers: { authorization: `Bearer ${token}` },
      payload: { total: 5 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("write to a non-member userId returns 404", async () => {
    context = await createTestContext();
    const { circle, token } = await setupCircleFixture(context);

    const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
    const bobHabit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: bob.user.id, input: { name: "Bob's habit", frequency: { type: "daily" } }, today: "2026-05-01" },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${bob.user.id}/habits/${bobHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("write to a habit not in CircleHabitShare returns 403", async () => {
    context = await createTestContext();
    const { userId, circle, token } = await setupCircleFixture(context);

    const unsharedHabit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId, input: { name: "Private habit", frequency: { type: "daily" } }, today: "2026-05-01" },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${unsharedHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("write to an archived habit returns 409 HABIT_INACTIVE", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    await context.app.db.entry.update({
      where: { id: booleanHabit.id },
      data: { isActive: false },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "HABIT_INACTIVE" });
  });

  it("undo with no prior mutation returns 409 UNDO_NOT_CIRCLE_SOURCED", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/undo`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "UNDO_NOT_CIRCLE_SOURCED" });
  });

  it("undo when latest mutation is WEB-sourced returns 409 UNDO_NOT_CIRCLE_SOURCED", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    await completeHabitForToday(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId, habitId: booleanHabit.id, source: "web", timestamp: TIMESTAMP },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/undo`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "UNDO_NOT_CIRCLE_SOURCED" });
  });

  it("undo when latest mutation is CIRCLE-sourced returns 200 reverting to previous state", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupCircleFixture(context);

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/undo`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      habitId: booleanHabit.id,
      userId,
      completed: false,
      currentValue: null,
    });
  });

  it("set-total with an invalid body returns 400 with issues", async () => {
    context = await createTestContext();
    const { userId, circle, token, quantityHabit } = await setupCircleFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${quantityHabit.id}/set-total`,
      headers: { authorization: `Bearer ${token}` },
      payload: { total: "not-a-number" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "BAD_REQUEST",
      issues: expect.anything(),
    });
  });
});
