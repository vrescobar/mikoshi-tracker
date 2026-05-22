import { afterEach, describe, expect, it } from "vitest";

import { createCircleToken } from "../../src/auth/circle-token";
import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import {
  addCircleMemberRecord,
  createCircleHabitShareRecord,
  createCircleRecord,
} from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

// 2026-05-18 is a Monday in UTC
const NOW = "2026-05-18T12:00:00.000Z";

async function setupFixture(context: TestContext) {
  const { body: alice } = await signUp(context.app, { email: "alice@example.com", name: "Alice" });
  const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

  const circle = await createCircleRecord(context.app.db, {
    ownerId: alice.user.id,
    name: "Test Circle",
  });
  // Bob joins after Alice — joinedAt ordering: Alice first, Bob second
  await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

  const { token } = await createCircleToken(context.app.db, circle.id);

  return { alice: alice.user, bob: bob.user, circle, token };
}

describe("circle read endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  // ─── GET /members ─────────────────────────────────────────────────────────────

  describe("GET /members", () => {
    it("returns 401 when Authorization header is absent", async () => {
      context = await createTestContext();
      const { circle } = await setupFixture(context);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 401 when Authorization scheme is not Bearer", async () => {
      context = await createTestContext();
      const { circle } = await setupFixture(context);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members`,
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 when token is unknown", async () => {
      context = await createTestContext();
      const { circle } = await setupFixture(context);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members`,
        headers: { authorization: "Bearer mikoshi_tracker_circle_not_a_real_token" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when token belongs to a different circle", async () => {
      context = await createTestContext();
      const { alice, circle } = await setupFixture(context);

      const otherCircle = await createCircleRecord(context.app.db, {
        ownerId: alice.id,
        name: "Other Circle",
      });
      const { token: otherToken } = await createCircleToken(context.app.db, otherCircle.id);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("returns 200 with members ordered by joinedAt ascending", async () => {
      context = await createTestContext();
      const { alice, bob, circle, token } = await setupFixture(context);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const { members } = response.json() as { members: Array<{ userId: string; displayName: string; role: string }> };

      expect(members).toHaveLength(2);
      // Alice (owner) joined at circle creation; Bob joined later
      expect(members[0]).toMatchObject({ userId: alice.id, displayName: "Alice", role: "owner" });
      expect(members[1]).toMatchObject({ userId: bob.id, displayName: "Bob", role: "member" });
    });
  });

  // ─── GET /leaderboard ─────────────────────────────────────────────────────────

  describe("GET /leaderboard", () => {
    it("excludes non-shared and inactive habits from leaderboard counts", async () => {
      context = await createTestContext();
      const { alice, circle, token } = await setupFixture(context);

      const sharedActive = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Shared active", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      const unshared = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Unshared habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      const sharedInactive = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Shared inactive", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );

      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: sharedActive.id });
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: sharedInactive.id });
      await context.app.db.entry.update({ where: { id: sharedInactive.id }, data: { isActive: false } });

      // Complete unshared and inactive habits — should not count
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: unshared.id, source: "web", timestamp: NOW });
      await context.app.db.entry.update({ where: { id: sharedInactive.id }, data: { isActive: true } });
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: sharedInactive.id, source: "web", timestamp: NOW });
      await context.app.db.entry.update({ where: { id: sharedInactive.id }, data: { isActive: false } });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as { leaderboard: Array<{ userId: string; completedTodayCount: number; sharedHabitCount: number }> };

      const aliceEntry = leaderboard.find((e) => e.userId === alice.id);
      expect(aliceEntry).toBeDefined();
      // Only the shared active habit counts; unshared and inactive are excluded
      expect(aliceEntry!.sharedHabitCount).toBe(1);
      expect(aliceEntry!.completedTodayCount).toBe(0);
    });

    it("computes completedTodayCount, currentStreak, and weeklyCompletionRate correctly", async () => {
      context = await createTestContext();
      const { alice, bob, circle, token } = await setupFixture(context);

      const aliceHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Alice habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: aliceHabit.id });

      // Alice: completed today and yesterday (streak = 1 from yesterday back, then stopped)
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: aliceHabit.id, source: "web", timestamp: NOW });
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: aliceHabit.id, source: "web", timestamp: "2026-05-17T12:00:00.000Z" });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as {
        leaderboard: Array<{
          userId: string;
          completedTodayCount: number;
          currentStreak: number;
          weeklyCompletionRate: number;
          sharedHabitCount: number;
        }>;
      };

      const aliceEntry = leaderboard.find((e) => e.userId === alice.id)!;
      expect(aliceEntry.completedTodayCount).toBe(1);
      // Streak counts back from yesterday: completed 2026-05-17, not 2026-05-16 → streak = 1
      expect(aliceEntry.currentStreak).toBe(1);
      // 2 completions in past 7 days, 1 habit * 7 days = 7; rate = min(1, 2/7) ≈ 0.29
      expect(aliceEntry.weeklyCompletionRate).toBe(0.29);
    });

    it("ranks by completedToday desc then currentStreak desc then displayName asc", async () => {
      context = await createTestContext();
      const { alice, bob, circle, token } = await setupFixture(context);

      // Create a third member Carol who has a streak but no today completion
      const { body: carol } = await signUp(context.app, { email: "carol@example.com", name: "Carol" });
      await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: carol.user.id });

      const aliceHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Alice habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      const carolHabit = await createHabit(
        { db: context.app.db },
        { userId: carol.user.id, input: { name: "Carol habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );

      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: aliceHabit.id });
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: carolHabit.id });

      // Alice: completed today; Carol: has yesterday streak but no today
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: aliceHabit.id, source: "web", timestamp: NOW });
      await completeHabitForToday({ db: context.app.db }, { userId: carol.user.id, habitId: carolHabit.id, source: "web", timestamp: "2026-05-17T12:00:00.000Z" });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as { leaderboard: Array<{ userId: string; displayName: string }> };

      const positions = leaderboard.map((e) => e.userId);
      // Alice (1 today) > Carol (0 today, 1 streak) > Bob (0 today, 0 streak)
      expect(positions.indexOf(alice.id)).toBeLessThan(positions.indexOf(carol.user.id));
      expect(positions.indexOf(carol.user.id)).toBeLessThan(positions.indexOf(bob.id));
    });

    it("member with zero shared habits yields all-zero leaderboard entry", async () => {
      context = await createTestContext();
      const { bob, circle, token } = await setupFixture(context);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as {
        leaderboard: Array<{ userId: string; completedTodayCount: number; currentStreak: number; weeklyCompletionRate: number; sharedHabitCount: number }>;
      };

      const bobEntry = leaderboard.find((e) => e.userId === bob.id)!;
      expect(bobEntry.sharedHabitCount).toBe(0);
      expect(bobEntry.completedTodayCount).toBe(0);
      expect(bobEntry.currentStreak).toBe(0);
      expect(bobEntry.weeklyCompletionRate).toBe(0);
    });

    it("currentStreak counts back from yesterday and never includes today", async () => {
      context = await createTestContext();
      const { alice, circle, token } = await setupFixture(context);

      const aliceHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Alice habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: aliceHabit.id });

      // Only complete today — no yesterday completion → streak should be 0
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: aliceHabit.id, source: "web", timestamp: NOW });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as { leaderboard: Array<{ userId: string; currentStreak: number }> };
      const aliceEntry = leaderboard.find((e) => e.userId === alice.id)!;
      // Today's completion does not count toward streak — streak starts from yesterday
      expect(aliceEntry.currentStreak).toBe(0);
    });

    it("surfaces externalId for a member enrolled with one, and null for a member without", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app, { email: "alice@example.com", name: "Alice" });
      const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Test Circle" });
      await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id, externalId: "ext-bob-42" });
      const { token } = await createCircleToken(context.app.db, circle.id);

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/leaderboard`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { leaderboard } = response.json() as { leaderboard: Array<{ userId: string; externalId: string | null }> };

      const aliceEntry = leaderboard.find((e) => e.userId === alice.user.id)!;
      const bobEntry = leaderboard.find((e) => e.userId === bob.user.id)!;
      // Alice was added via createCircleRecord (owner, no externalId)
      expect(aliceEntry.externalId).toBeNull();
      // Bob was enrolled with externalId
      expect(bobEntry.externalId).toBe("ext-bob-42");
    });
  });

  // ─── GET /members/:userId/habits ──────────────────────────────────────────────

  describe("GET /members/:userId/habits", () => {
    it("returns 404 for a userId that is not a circle member", async () => {
      context = await createTestContext();
      const { circle, token } = await setupFixture(context);
      const { body: outsider } = await signUp(context.app, { email: "outsider@example.com", name: "Outsider" });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${outsider.user.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("todayStatus is not_due when today is before the habit's startDate", async () => {
      context = await createTestContext();
      const { alice, circle, token } = await setupFixture(context);

      const futureHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Future habit", frequency: { type: "daily" }, startDate: "2026-05-20" }, today: "2026-05-18" },
      );
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: futureHabit.id });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${alice.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { habits } = response.json() as { habits: Array<{ habitId: string; todayStatus: string }> };
      const entry = habits.find((h) => h.habitId === futureHabit.id)!;
      expect(entry.todayStatus).toBe("not_due");
    });

    it("todayStatus is not_due for a WEEKDAYS habit when today is not one of its days", async () => {
      context = await createTestContext();
      const { alice, circle, token } = await setupFixture(context);

      // NOW is Monday; schedule habit for Tue–Fri only
      const weekdayHabit = await createHabit(
        { db: context.app.db },
        {
          userId: alice.id,
          input: {
            name: "Weekday habit",
            frequency: { type: "weekdays", days: ["tuesday", "wednesday", "thursday", "friday"] },
            startDate: "2026-05-01",
          },
          today: "2026-05-18",
        },
      );
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: weekdayHabit.id });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${alice.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { habits } = response.json() as { habits: Array<{ habitId: string; todayStatus: string }> };
      const entry = habits.find((h) => h.habitId === weekdayHabit.id)!;
      expect(entry.todayStatus).toBe("not_due");
    });

    it("todayStatus is completed or pending based on dayStates", async () => {
      context = await createTestContext();
      const { alice, circle, token } = await setupFixture(context);

      const pendingHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Pending habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      const completedHabit = await createHabit(
        { db: context.app.db },
        { userId: alice.id, input: { name: "Completed habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );

      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: pendingHabit.id });
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: completedHabit.id });
      await completeHabitForToday({ db: context.app.db }, { userId: alice.id, habitId: completedHabit.id, source: "web", timestamp: NOW });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${alice.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": NOW },
      });

      expect(response.statusCode).toBe(200);
      const { habits } = response.json() as { habits: Array<{ habitId: string; todayStatus: string }> };

      expect(habits.find((h) => h.habitId === pendingHabit.id)!.todayStatus).toBe("pending");
      expect(habits.find((h) => h.habitId === completedHabit.id)!.todayStatus).toBe("completed");
    });

    it("uses the member's timezone to determine today when x-mikoshi-tracker-now is set", async () => {
      context = await createTestContext();

      // Alice signed up with Asia/Shanghai (UTC+8); at 19:59 UTC that is 03:59 Shanghai
      // → still before the 04:00 cutoff → todayKey stays at 2026-05-18
      // At 20:01 UTC → 04:01 Shanghai → past cutoff → todayKey advances to 2026-05-19
      const { body: alice } = await signUp(context.app, { email: "alice@example.com", name: "Alice", timezone: "Asia/Shanghai" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "TZ Circle" });
      const { token } = await createCircleToken(context.app.db, circle.id);

      const habit = await createHabit(
        { db: context.app.db },
        { userId: alice.user.id, input: { name: "Daily habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
      );
      await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: habit.id });

      // Complete habit for 2026-05-18 (Shanghai business day starting around UTC 2026-05-17T20:00)
      await completeHabitForToday({ db: context.app.db }, { userId: alice.user.id, habitId: habit.id, source: "web", timestamp: "2026-05-18T12:00:00.000Z" });

      // Before Shanghai date rollover (19:59 UTC = 03:59 Shanghai May 19 — still May 18 business day)
      const beforeRollover = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${alice.user.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": "2026-05-18T19:59:00.000Z" },
      });
      expect(beforeRollover.statusCode).toBe(200);
      expect(beforeRollover.json().habits[0].todayStatus).toBe("completed");

      // After Shanghai date rollover (20:01 UTC = 04:01 Shanghai May 19 — now May 19 business day)
      const afterRollover = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/members/${alice.user.id}/habits`,
        headers: { authorization: `Bearer ${token}`, "x-mikoshi-tracker-now": "2026-05-18T20:01:00.000Z" },
      });
      expect(afterRollover.statusCode).toBe(200);
      expect(afterRollover.json().habits[0].todayStatus).toBe("pending");
    });
  });
});
