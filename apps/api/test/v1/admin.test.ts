import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const ADMIN_KEY = "test-admin-key-1234567890";
const auth = { authorization: `Bearer ${ADMIN_KEY}` };

describe("v1 admin god-mode endpoints", () => {
  let ctx: TestContext;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
    ({ ctx } = await createV1DepsContext());
    await signUp(ctx.app);
  });

  afterAll(async () => {
    await ctx.cleanup();
    if (previousKey === undefined) delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    else process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = previousKey;
  });

  it("rejects missing admin key with 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/admin/users" });
    expect(response.statusCode).toBe(401);
    const body = response.json() as Envelope<unknown>;
    expect(body.ok).toBe(false);
  });

  it("lists all users with pagination envelope", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/admin/users", headers: auth });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Envelope<{ items: { email: string }[]; total: number }>;
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("reports system dashboard metrics", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/admin/dashboard/metrics", headers: auth });
    const body = response.json() as Envelope<{ users: number; circles: number }>;
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.data.users).toBeGreaterThanOrEqual(1);
  });

  it("freezes and lists a circle leaderboard snapshot", async () => {
    const owner = await ctx.app.db.user.findFirstOrThrow();
    const circle = await ctx.app.db.circle.create({
      data: { name: "Bikini 2026", ownerId: owner.id, season: "bikini-2026" },
    });
    await ctx.app.db.circleMembership.create({
      data: { circleId: circle.id, userId: owner.id, role: "owner" },
    });

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/circles/snapshot/create",
      headers: auth,
      payload: { circleId: circle.id },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as Envelope<{ season: string; count: number }>;
    expect(createdBody.ok).toBe(true);
    if (createdBody.ok) {
      expect(createdBody.data.season).toBe("bikini-2026");
      expect(createdBody.data.count).toBe(1);
    }

    const list = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/admin/circles/snapshot/list?circleId=${circle.id}`,
      headers: auth,
    });
    const listBody = list.json() as Envelope<{ items: { rank: number; userId: string }[]; total: number }>;
    expect(listBody.ok).toBe(true);
    if (listBody.ok) {
      expect(listBody.data.total).toBe(1);
      expect(listBody.data.items[0].rank).toBe(1);
    }
  });
});
