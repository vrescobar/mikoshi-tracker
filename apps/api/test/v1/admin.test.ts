import { afterAll, beforeAll, describe, expect, it } from "bun:test";

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

  it("compares two leaderboard snapshot seasons", async () => {
    const owner = await ctx.app.db.user.findFirstOrThrow();
    const circle = await ctx.app.db.circle.create({ data: { name: "Cmp", ownerId: owner.id } });
    await ctx.app.db.circleMembership.create({ data: { circleId: circle.id, userId: owner.id, role: "owner" } });

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/circles/snapshot/create",
      headers: auth,
      payload: { circleId: circle.id, season: "s1" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/circles/snapshot/create",
      headers: auth,
      payload: { circleId: circle.id, season: "s2" },
    });

    const cmp = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/admin/circles/snapshot/compare?circleId=${circle.id}&seasonA=s1&seasonB=s2`,
      headers: auth,
    });
    const body = cmp.json() as Envelope<{ rows: { userId: string; rankDelta: number | null }[] }>;
    expect(body.ok).toBe(true);
    if (body.ok) {
      const me = body.data.rows.find((r) => r.userId === owner.id);
      expect(me?.rankDelta).toBe(0);
    }
  });

  it("reads token metadata and idempotently ensures a personal token", async () => {
    const user = await ctx.app.db.user.findFirstOrThrow();

    const metaBefore = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/admin/users/token?userId=${user.id}`,
      headers: auth,
    });
    const metaBody = metaBefore.json() as Envelope<{ hasToken: boolean }>;
    expect(metaBody.ok).toBe(true);

    const ensure1 = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users/token/ensure",
      headers: auth,
      payload: { userId: user.id },
    });
    const e1 = ensure1.json() as Envelope<{ created: boolean; token: string | null }>;
    expect(e1.ok).toBe(true);
    if (!e1.ok) throw new Error("expected success");

    // Second ensure must NOT rotate and must NOT re-reveal the plaintext.
    const ensure2 = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users/token/ensure",
      headers: auth,
      payload: { userId: user.id },
    });
    const e2 = ensure2.json() as Envelope<{ created: boolean; token: string | null }>;
    if (e2.ok) {
      expect(e2.data.created).toBe(false);
      expect(e2.data.token).toBeNull();
    }
    // The first call either created (token present) or found an existing one (null).
    if (e1.data.created) expect(typeof e1.data.token).toBe("string");
  });

  it("bulk-assigns a habit to circle members and buckets unknown ids", async () => {
    const owner = await ctx.app.db.user.findFirstOrThrow();
    const circle = await ctx.app.db.circle.create({ data: { name: "Bulk", ownerId: owner.id } });
    await ctx.app.db.circleMembership.create({ data: { circleId: circle.id, userId: owner.id, role: "owner" } });
    await ctx.app.db.user.update({ where: { id: owner.id }, data: { externalId: "owner-ext-1" } });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/circles/bulk-assign-habit",
      headers: auth,
      payload: {
        circleId: circle.id,
        externalIds: ["owner-ext-1", "ghost-ext-2"],
        habit: { name: "Drink water", frequency: { type: "daily" } },
      },
    });
    const body = res.json() as Envelope<{ assigned: string[]; notProvisioned: string[] }>;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data.assigned).toContain("owner-ext-1");
      expect(body.data.notProvisioned).toContain("ghost-ext-2");
    }
  });
});
