import { afterEach, describe, expect, it } from "bun:test";

import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("circle habit share endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  async function setupCircle(ctx: TestContext) {
    const { body: alice, cookie: aliceCookie } = await signUp(ctx.app);

    const circleRes = await ctx.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    return { alice: alice.user, aliceCookie, circleId };
  }

  // ── POST /api/circles/:circleId/shares ──────────────────────────────────────

  it("POST /shares returns 201 and records the share", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const habit = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Morning run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: habit.id },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ habitId: habit.id, circleId });
  });

  it("POST /shares returns 403 when caller is not a circle member", async () => {
    context = await createTestContext();
    const { circleId } = await setupCircle(context);
    const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const habit = await createHabit(
      { db: context.app.db },
      { userId: bob.user.id, input: { name: "Evening run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: bobCookie },
      payload: { habitId: habit.id },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("POST /shares returns 404 when habit belongs to another user", async () => {
    context = await createTestContext();
    const { aliceCookie, circleId } = await setupCircle(context);
    const { body: carol } = await signUp(context.app, { email: "carol@example.com", name: "Carol" });

    const carolHabit = await createHabit(
      { db: context.app.db },
      { userId: carol.user.id, input: { name: "Carol habit", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: carolHabit.id },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("POST /shares returns 404 when habit does not exist", async () => {
    context = await createTestContext();
    const { aliceCookie, circleId } = await setupCircle(context);

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: "nonexistent-habit-id" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("POST /shares returns 409 when habit is already shared in the circle", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const habit = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Morning run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: habit.id },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: habit.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "CONFLICT" });
  });

  // ── DELETE /api/circles/:circleId/shares/:habitId ───────────────────────────

  it("DELETE /shares/:habitId returns 204 and removes the share", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const habit = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Morning run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: habit.id },
    });

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/shares/${habit.id}`,
      headers: { cookie: aliceCookie },
    });

    expect(response.statusCode).toBe(204);
  });

  it("DELETE /shares/:habitId returns 403 when caller is not a circle member", async () => {
    context = await createTestContext();
    const { circleId } = await setupCircle(context);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/shares/any-habit-id`,
      headers: { cookie: bobCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("DELETE /shares/:habitId returns 404 when habit is not shared in the circle", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const habit = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Morning run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/shares/${habit.id}`,
      headers: { cookie: aliceCookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // ── sharedInCircles enrichment on GET /api/habits and /api/habits/:id ────────

  it("GET /api/habits reports sharedInCircles for a shared habit, omits it otherwise", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const shared = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Shared run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );
    const solo = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Solo stretch", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: shared.id },
    });

    const listResponse = await context.app.inject({
      method: "GET",
      url: "/api/habits",
      headers: { cookie: aliceCookie },
    });

    expect(listResponse.statusCode).toBe(200);
    const items = listResponse.json().items as Array<{
      id: string;
      sharedInCircles?: Array<{ circleId: string; name: string }>;
    }>;

    const sharedItem = items.find((h) => h.id === shared.id);
    const soloItem = items.find((h) => h.id === solo.id);
    expect(sharedItem?.sharedInCircles).toEqual([{ circleId, name: "Alice's Circle" }]);
    // Non-shared habit: field is absent (optional, only set when shared).
    expect(soloItem?.sharedInCircles).toBeUndefined();
  });

  it("GET /api/habits/:id reports sharedInCircles for a shared habit", async () => {
    context = await createTestContext();
    const { alice, aliceCookie, circleId } = await setupCircle(context);

    const habit = await createHabit(
      { db: context.app.db },
      { userId: alice.id, input: { name: "Morning run", frequency: { type: "daily" }, startDate: "2026-05-01" }, today: "2026-05-18" },
    );

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/shares`,
      headers: { cookie: aliceCookie },
      payload: { habitId: habit.id },
    });

    const detailResponse = await context.app.inject({
      method: "GET",
      url: `/api/habits/${habit.id}`,
      headers: { cookie: aliceCookie },
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().item.habit.sharedInCircles).toEqual([
      { circleId, name: "Alice's Circle" },
    ]);
  });
});
