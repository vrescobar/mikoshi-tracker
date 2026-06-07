import { afterEach, describe, expect, it } from "vitest";

import { createCircleToken } from "../../src/auth/circle-token";
import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import { createCircleHabitShareRecord, createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

// Pin "now" so the backdate guard (measured from the member's local today) is
// deterministic. UTC member tz keeps dateKeys == calendar dates. 2026-05-18 = Mon.
const NOW = "2026-05-18T12:00:00.000Z";
const TODAY = "2026-05-18";
const TWO_DAYS_AGO = "2026-05-16"; // Saturday

async function setupFixture(context: TestContext) {
  const { body: alice } = await signUp(context.app, { timezone: "UTC" });
  const userId = alice.user.id;

  const circle = await createCircleRecord(context.app.db, { ownerId: userId, name: "Test Circle" });
  const { token } = await createCircleToken(context.app.db, circle.id);

  const booleanHabit = await createHabit(
    { db: context.app.db },
    { userId, input: { name: "Morning run", frequency: { type: "daily" } }, today: "2026-05-01" },
  );
  const quantityHabit = await createHabit(
    { db: context.app.db },
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

function circleAuth(token: string) {
  return { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW };
}

describe("circle backdated check-ins", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("complete with a past `date` records on that day, not today", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: TWO_DAYS_AGO },
    });
    expect(response.statusCode).toBe(200);

    const past = await context.app.db.entryEvent.findFirst({
      where: { entryId: booleanHabit.id, dateKey: TWO_DAYS_AGO },
    });
    expect(past?.completed).toBe(true);

    const today = await context.app.db.entryEvent.findFirst({
      where: { entryId: booleanHabit.id, dateKey: TODAY },
    });
    expect(today).toBeNull();
  });

  it("set-total with a past `date` records the value on that day", async () => {
    context = await createTestContext();
    const { userId, circle, token, quantityHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${quantityHabit.id}/set-total`,
      headers: circleAuth(token),
      payload: { total: 25, date: TWO_DAYS_AGO },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ completed: true, currentValue: 25 });

    const past = await context.app.db.entryEvent.findFirst({
      where: { entryId: quantityHabit.id, dateKey: TWO_DAYS_AGO },
    });
    expect(past?.completed).toBe(true);
    expect(Number(past?.value)).toBe(25);
  });

  it("undo with a past `date` reverts that day's circle-sourced check-in", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    // First backdate a circle-sourced completion, then undo it on the same day.
    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: TWO_DAYS_AGO },
    });

    const undo = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/undo`,
      headers: circleAuth(token),
      payload: { date: TWO_DAYS_AGO },
    });
    expect(undo.statusCode).toBe(200);
    expect(undo.json()).toMatchObject({ completed: false });

    const state = await context.app.db.entryEvent.findFirst({
      where: { entryId: booleanHabit.id, dateKey: TWO_DAYS_AGO },
    });
    expect(state?.completed).toBe(false);
  });

  it("undo with a past `date` refuses a non-circle-sourced mutation (409)", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    // A web-sourced completion on the past day — circle must not undo it.
    await completeHabitForToday(
      { db: context.app.db },
      { userId, habitId: booleanHabit.id, source: "web", timestamp: `${TWO_DAYS_AGO}T12:00:00.000Z` },
    );

    const undo = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/undo`,
      headers: circleAuth(token),
      payload: { date: TWO_DAYS_AGO },
    });
    expect(undo.statusCode).toBe(409);
    expect(undo.json()).toMatchObject({ code: "UNDO_NOT_CIRCLE_SOURCED" });
  });

  it("rejects a future date (400)", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: "2026-05-20" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a date older than 14 days (400)", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: "2026-05-01" }, // 17 days before TODAY
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts the exact 14-day boundary", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: "2026-05-04" }, // exactly TODAY - 14
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects backdating a WEEKDAYS habit to an unscheduled weekday, accepts a scheduled one", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app, { timezone: "UTC" });
    const userId = alice.user.id;
    const circle = await createCircleRecord(context.app.db, { ownerId: userId, name: "WD Circle" });
    const { token } = await createCircleToken(context.app.db, circle.id);
    const habit = await createHabit(
      { db: context.app.db },
      {
        userId,
        input: { name: "Gym", frequency: { type: "weekdays", days: ["monday", "wednesday", "friday"] } },
        today: "2026-05-01",
      },
    );
    await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: habit.id });

    // 2026-05-16 is a Saturday → not scheduled → 400.
    const unscheduled = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${habit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: "2026-05-16" },
    });
    expect(unscheduled.statusCode).toBe(400);

    // 2026-05-13 is a Wednesday → scheduled → 200.
    const scheduled = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${habit.id}/complete`,
      headers: circleAuth(token),
      payload: { date: "2026-05-13" },
    });
    expect(scheduled.statusCode).toBe(200);
  });

  it("without a `date` records on today (unchanged behavior)", async () => {
    context = await createTestContext();
    const { userId, circle, token, booleanHabit } = await setupFixture(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circle.id}/members/${userId}/habits/${booleanHabit.id}/complete`,
      headers: circleAuth(token),
    });
    expect(response.statusCode).toBe(200);

    const today = await context.app.db.entryEvent.findFirst({
      where: { entryId: booleanHabit.id, dateKey: TODAY },
    });
    expect(today?.completed).toBe(true);
  });
});
