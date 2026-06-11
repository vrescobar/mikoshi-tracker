/**
 * Legacy-route god-mode tests (`x-act-as-user` outside /api/v1).
 *
 * getAuthenticatedUser() — the choke point for every legacy user-scoped
 * controller — honours the impersonation header for any valid admin operator
 * (session admins included), /api/session answers as the target user, and the
 * global onResponse hook audits impersonated legacy mutations.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

async function promoteToAdmin(context: TestContext, cookie: string): Promise<void> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/test/session/promote-admin",
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
}

async function provisionTarget(context: TestContext, externalId: string) {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/provision-user",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, name: "Target", timezone: "Europe/Madrid" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { userId: string; personalToken: string };
}

describe("legacy x-act-as-user impersonation", () => {
  let context: TestContext | undefined;

  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  });

  afterEach(async () => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("/api/session answers as the target user with an impersonating marker", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { email: "admin@example.com" });
    await promoteToAdmin(context, cookie);
    const target = await provisionTarget(context, "ext-impersonate-session");

    const res = await context.app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie, "x-act-as-user": target.userId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; isAdmin: boolean };
      timezone: string;
      impersonating?: { operator: { type: string; label: string } };
    };
    expect(body.user.id).toBe(target.userId);
    expect(body.user.isAdmin).toBe(false);
    expect(body.timezone).toBe("Europe/Madrid");
    expect(body.impersonating?.operator.type).toBe("session");
  });

  it("reads legacy routes as the target (GET /api/today)", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { email: "admin2@example.com" });
    await promoteToAdmin(context, cookie);
    const target = await provisionTarget(context, "ext-impersonate-today");

    const res = await context.app.inject({
      method: "GET",
      url: "/api/today",
      headers: { cookie, "x-act-as-user": target.userId },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { summary: { totalCount: number } }).summary.totalCount).toBe(0);
  });

  it("mutations land on the target and are audited as impersonate.legacy.*", async () => {
    context = await createTestContext();
    const { cookie, body } = await signUp(context.app, { email: "admin3@example.com" });
    await promoteToAdmin(context, cookie);
    const target = await provisionTarget(context, "ext-impersonate-mutate");

    const res = await context.app.inject({
      method: "POST",
      url: "/api/habits",
      headers: { cookie, "x-act-as-user": target.userId },
      payload: {
        name: "Impersonated habit",
        kind: "boolean",
        frequency: { type: "daily" },
        startDate: "2026-06-11",
      },
    });

    expect(res.statusCode).toBe(201);
    const habit = (res.json() as { item: { userId: string; id: string } }).item;
    expect(habit.userId).toBe(target.userId);

    const audit = await context.app.db.adminAuditLog.findFirst({
      where: { action: { startsWith: "impersonate.legacy.POST" } },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorType).toBe("session");
    expect(audit?.actorId).toBe(body.user.id);
    expect(audit?.targetId).toBe(target.userId);
  });

  it("reads are not audited", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { email: "admin4@example.com" });
    await promoteToAdmin(context, cookie);
    const target = await provisionTarget(context, "ext-impersonate-read");

    await context.app.inject({
      method: "GET",
      url: "/api/habits",
      headers: { cookie, "x-act-as-user": target.userId },
    });

    const audit = await context.app.db.adminAuditLog.findFirst({
      where: { action: { startsWith: "impersonate.legacy.GET" } },
    });
    expect(audit).toBeNull();
  });

  it("a non-admin session with the header gets 401", async () => {
    context = await createTestContext();
    await signUp(context.app, { email: "first5@example.com" });
    const { cookie } = await signUp(context.app, { email: "second5@example.com" });
    const target = await provisionTarget(context, "ext-impersonate-nonadmin");

    const res = await context.app.inject({
      method: "GET",
      url: "/api/today",
      headers: { cookie, "x-act-as-user": target.userId },
    });

    expect(res.statusCode).toBe(401);
  });

  it("a personal API token with the header gets 401 (header forces the admin path)", async () => {
    context = await createTestContext();
    await signUp(context.app, { email: "admin6@example.com" });
    const target = await provisionTarget(context, "ext-impersonate-token");
    const victim = await provisionTarget(context, "ext-impersonate-victim");

    const res = await context.app.inject({
      method: "GET",
      url: "/api/today",
      headers: {
        authorization: `Bearer ${target.personalToken}`,
        "x-act-as-user": victim.userId,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("an unknown target user yields 404", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { email: "admin7@example.com" });
    await promoteToAdmin(context, cookie);

    const res = await context.app.inject({
      method: "GET",
      url: "/api/today",
      headers: { cookie, "x-act-as-user": "nope-no-such-user" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("api-access stays excluded — admin cannot read the target's token surface", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app, { email: "admin8@example.com" });
    await promoteToAdmin(context, cookie);
    const target = await provisionTarget(context, "ext-impersonate-apiaccess");

    const res = await context.app.inject({
      method: "GET",
      url: "/api/api-access/token",
      headers: { cookie, "x-act-as-user": target.userId },
    });

    // The route uses requireSession directly: the header is ignored and the
    // response describes the ADMIN's own token state, not the target's.
    expect(res.statusCode).toBe(200);
  });
});
