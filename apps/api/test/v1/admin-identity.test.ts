import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const ROOT_KEY = "test-admin-key-1234567890";
const rootAuth = { authorization: `Bearer ${ROOT_KEY}` };

function unwrap<T>(res: { json: () => unknown }): T {
  const body = res.json() as Envelope<T>;
  if (!body.ok) throw new Error(`expected success, got ${JSON.stringify(body)}`);
  return body.data;
}

describe("v1 admin operator identity + audit log (B7b)", () => {
  let ctx: TestContext;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ROOT_KEY;
    ({ ctx } = await createV1DepsContext());
    await signUp(ctx.app);
  });

  afterAll(async () => {
    await ctx.cleanup();
    if (previousKey === undefined) delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    else process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = previousKey;
  });

  it("mints a named token with the root key and authenticates god-mode with it", async () => {
    const minted = unwrap<{ token: string; tokenId: string; label: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/admin/tokens/mint",
        headers: rootAuth,
        payload: { label: "mikoshi-bot" },
      }),
    );
    expect(minted.token.startsWith("mikoshi_tracker_admin_")).toBe(true);

    const tokenAuth = { authorization: `Bearer ${minted.token}` };
    const usersWithToken = await ctx.app.inject({ method: "GET", url: "/api/v1/admin/users", headers: tokenAuth });
    expect(usersWithToken.statusCode).toBe(200);

    // The token appears in the (metadata-only) token list.
    const list = unwrap<{ tokens: { tokenId: string; label: string }[] }>(
      await ctx.app.inject({ method: "GET", url: "/api/v1/admin/tokens", headers: rootAuth }),
    );
    expect(list.tokens.some((t) => t.tokenId === minted.tokenId)).toBe(true);
  });

  it("rejects a revoked token", async () => {
    const minted = unwrap<{ token: string; tokenId: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/admin/tokens/mint",
        headers: rootAuth,
        payload: { label: "to-revoke" },
      }),
    );
    const tokenAuth = { authorization: `Bearer ${minted.token}` };

    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/admin/users", headers: tokenAuth })).statusCode).toBe(
      200,
    );

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/tokens/revoke",
      headers: rootAuth,
      payload: { tokenId: minted.tokenId },
    });

    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/admin/users", headers: tokenAuth })).statusCode).toBe(
      401,
    );
  });

  it("attributes an action to the named operator in the audit log", async () => {
    const minted = unwrap<{ token: string }>(
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/admin/tokens/mint",
        headers: rootAuth,
        payload: { label: "auditor-bot" },
      }),
    );
    const tokenAuth = { authorization: `Bearer ${minted.token}` };

    const owner = await ctx.app.db.user.findFirstOrThrow();
    const circle = await ctx.app.db.circle.create({ data: { name: "Audit", ownerId: owner.id } });
    await ctx.app.db.circleMembership.create({ data: { circleId: circle.id, userId: owner.id, role: "owner" } });

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/circles/snapshot/create",
      headers: tokenAuth,
      payload: { circleId: circle.id, season: "audit-1" },
    });

    const log = unwrap<{
      items: { action: string; actorType: string; actorLabel: string | null; targetId: string | null }[];
    }>(await ctx.app.inject({ method: "GET", url: "/api/v1/admin/audit-log", headers: rootAuth }));

    const entry = log.items.find((e) => e.action === "circle.snapshot.create" && e.targetId === circle.id);
    expect(entry).toBeDefined();
    expect(entry?.actorType).toBe("token");
    expect(entry?.actorLabel).toBe("auditor-bot");
  });

  it("records the root key as actorType 'env'", async () => {
    const user = await ctx.app.db.user.findFirstOrThrow();
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users/token/ensure",
      headers: rootAuth,
      payload: { userId: user.id },
    });
    const log = unwrap<{ items: { action: string; actorType: string }[] }>(
      await ctx.app.inject({ method: "GET", url: "/api/v1/admin/audit-log?action=user.token.ensure", headers: rootAuth }),
    );
    expect(log.items.length).toBeGreaterThanOrEqual(1);
    expect(log.items[0].actorType).toBe("env");
  });
});
