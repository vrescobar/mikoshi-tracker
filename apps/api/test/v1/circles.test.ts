import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

function unwrap<T>(res: { json: () => unknown }): T {
  const body = res.json() as Envelope<T>;
  if (!body.ok) throw new Error(`expected success, got ${JSON.stringify(body)}`);
  return body.data;
}

describe("v1 circles RPC flow", () => {
  let ctx: TestContext;
  let cookie: string;
  let userId: string;
  let circleId: string;
  let habitId: string;
  let circleToken: string;

  const circleAuth = () => ({ authorization: `Bearer ${circleToken}` });

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    const session = await signUp(ctx.app);
    cookie = session.cookie;
    userId = session.body.user.id;

    const circle = unwrap<{ item: { id: string } }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/create",
        headers: { cookie },
        payload: { name: "Morning Crew" },
      }),
    );
    circleId = circle.item.id;

    const habit = unwrap<{ id: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/entries/create",
        headers: { cookie },
        payload: { entryTypeSlug: "habit_boolean", name: "Meditate", config: { frequencyType: "DAILY" } },
      }),
    );
    habitId = habit.id;

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/circles/share",
      headers: { cookie },
      payload: { circleId, habitId },
    });

    const token = unwrap<{ token: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/token/mint",
        headers: { cookie },
        payload: { circleId, label: "test bridge" },
      }),
    );
    circleToken = token.token;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("lists the caller's circles (bearer)", async () => {
    const data = unwrap<{ items: { id: string }[]; total: number }>(
      await ctx.app.inject({ method: "GET", url: "/api/v1/circles", headers: { cookie } }),
    );
    expect(data.items.some((c) => c.id === circleId)).toBe(true);
  });

  it("returns circle detail with members and shared habits (bearer)", async () => {
    const data = unwrap<{ circle: { id: string }; members: unknown[]; mySharedHabits: { habitId: string }[] }>(
      await ctx.app.inject({ method: "GET", url: `/api/v1/circles/${circleId}`, headers: { cookie } }),
    );
    expect(data.circle.id).toBe(circleId);
    expect(data.mySharedHabits.some((h) => h.habitId === habitId)).toBe(true);
  });

  it("reads the leaderboard with a circle token", async () => {
    const data = unwrap<{ leaderboard: { userId: string; sharedHabitCount: number }[] }>(
      await ctx.app.inject({
        method: "GET",
        url: `/api/v1/circles/${circleId}/leaderboard`,
        headers: circleAuth(),
      }),
    );
    const me = data.leaderboard.find((r) => r.userId === userId);
    expect(me?.sharedHabitCount).toBe(1);
  });

  it("rejects a circle-token route without the token", async () => {
    const res = await ctx.app.inject({ method: "GET", url: `/api/v1/circles/${circleId}/leaderboard` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a circle token scoped to a different circle", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/circles/some-other-circle/leaderboard`,
      headers: circleAuth(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("completes a member's habit with the circle token (source: circle)", async () => {
    const data = unwrap<{ completed: boolean }>(
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/circles/${circleId}/complete`,
        headers: circleAuth(),
        payload: { userId, habitId },
      }),
    );
    expect(data.completed).toBe(true);

    // B7a: the mutation records WHICH circle it was made on behalf of.
    const mutation = await ctx.app.db.eventMutation.findFirst({
      where: { onBehalfOfCircleId: circleId, type: { not: "UNDO" } },
      orderBy: { createdAt: "desc" },
    });
    expect(mutation?.source).toBe("CIRCLE");
    expect(mutation?.onBehalfOfCircleId).toBe(circleId);

    // Now the leaderboard reflects the completion.
    const lb = unwrap<{ leaderboard: { userId: string; completedTodayCount: number }[] }>(
      await ctx.app.inject({
        method: "GET",
        url: `/api/v1/circles/${circleId}/leaderboard`,
        headers: circleAuth(),
      }),
    );
    expect(lb.leaderboard.find((r) => r.userId === userId)?.completedTodayCount).toBe(1);
  });

  it("undoes a circle-sourced check-in with the circle token", async () => {
    const data = unwrap<{ completed: boolean }>(
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/circles/${circleId}/undo`,
        headers: circleAuth(),
        payload: { userId, habitId },
      }),
    );
    expect(data.completed).toBe(false);
  });

  it("lists and revokes circle tokens (owner)", async () => {
    const minted = unwrap<{ tokenId: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/circles/token/mint",
        headers: { cookie },
        payload: { circleId, label: "to revoke" },
      }),
    );
    const list = unwrap<{ tokens: { tokenId: string }[] }>(
      await ctx.app.inject({ method: "GET", url: `/api/v1/circles/${circleId}/tokens`, headers: { cookie } }),
    );
    expect(list.tokens.some((t) => t.tokenId === minted.tokenId)).toBe(true);

    const revoke = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/circles/token/revoke",
      headers: { cookie },
      payload: { circleId, tokenId: minted.tokenId },
    });
    expect((revoke.json() as Envelope<unknown>).ok).toBe(true);
  });

  it("unshares a habit", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/circles/unshare",
      headers: { cookie },
      payload: { circleId, habitId },
    });
    expect((res.json() as Envelope<unknown>).ok).toBe(true);
  });
});
