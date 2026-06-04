import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const ADMIN_KEY = "test-admin-key-impersonation-9876";

/**
 * End-to-end god-mode: an admin (admin key + `x-act-as-user`) drives the normal
 * v1 bearer surface AS another user — creating a habit, marking its check-in —
 * and every impersonated mutation lands in the admin audit log.
 */
describe("v1 impersonation (god mode)", () => {
  let ctx: TestContext;
  let userId: string;
  let previousKey: string | undefined;

  const adminAct = (extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${ADMIN_KEY}`,
    "x-act-as-user": userId,
    ...extra,
  });

  beforeAll(async () => {
    previousKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
    ({ ctx } = await createV1DepsContext());
    const { body } = await signUp(ctx.app, { email: "target@example.com", name: "Target" });
    userId = body.user.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
    if (previousKey === undefined) delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    else process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = previousKey;
  });

  it("rejects the act-as header without a valid admin key (401)", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/entries",
      headers: { authorization: "Bearer not-the-admin-key", "x-act-as-user": userId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("404s when impersonating a non-existent user", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/entries",
      headers: { authorization: `Bearer ${ADMIN_KEY}`, "x-act-as-user": "user_does_not_exist" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("creates a habit AS the target user and marks today's check-in", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: adminAct(),
      payload: { entryTypeSlug: "habit_boolean", name: "Meditate", config: { frequencyType: "DAILY" } },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as Envelope<{ id: string; userId: string }>;
    if (!createdBody.ok) throw new Error(`expected success, got ${JSON.stringify(createdBody)}`);
    expect(createdBody.data.userId).toBe(userId);
    const habitId = createdBody.data.id;

    const completed = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/checkins/complete",
      headers: adminAct(),
      payload: { habitId, source: "system" },
    });
    expect(completed.statusCode).toBe(200);
    const completedBody = completed.json() as Envelope<unknown>;
    expect(completedBody.ok).toBe(true);

    // The check-in is reflected in the target user's own today summary.
    const today = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary", headers: adminAct() });
    const todayBody = today.json() as Envelope<{ summary: { completedItems: { name: string }[] } }>;
    if (!todayBody.ok) throw new Error("expected success");
    expect(todayBody.data.summary.completedItems.some((i) => i.name === "Meditate")).toBe(true);
  });

  it("records every impersonated mutation in the admin audit log", async () => {
    const logs = await ctx.app.db.adminAuditLog.findMany({
      where: { targetType: "user", targetId: userId },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("impersonate.entries.entriesCreate");
    expect(actions).toContain("impersonate.checkins.checkinsComplete");
    // A read (today/summary) is not a mutation, so it must not be audited.
    expect(actions.every((a) => !a.includes("todaySummary"))).toBe(true);
  });
});
