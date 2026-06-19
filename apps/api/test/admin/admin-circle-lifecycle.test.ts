import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { assertCircleAcceptsCheckins, CircleClosedError } from "../../src/modules/circles/circle.service";
import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

/** Provision a user via the admin API and return its externalId/userId. */
async function provision(context: TestContext, externalId: string): Promise<string> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/provision-user",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId },
  });
  const body = res.json() as { userId: string };
  return body.userId;
}

const auth = { authorization: `Bearer ${ADMIN_KEY}` };

describe("admin circle lifecycle routes", () => {
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

  describe("POST /api/admin/circles", () => {
    it("creates a circle owned by a provisioned user and returns a circle token", async () => {
      context = await createTestContext();
      await provision(context, "owner-ext-1");

      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles",
        headers: auth,
        payload: {
          name: "Operación Bikini",
          ownerExternalId: "owner-ext-1",
          season: "bikini-2026",
          contestStartAt: "2026-06-01T00:00:00.000Z",
          contestEndAt: "2026-06-30T00:00:00.000Z",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.circleToken).toMatch(/^mikoshi_tracker_circle_/);
      expect(body.circle).toMatchObject({
        name: "Operación Bikini",
        status: "active",
        season: "bikini-2026",
        leaderboardMode: "rolling",
        memberCount: 1, // owner is an owner-member
      });
      expect(body.circle.contestStartAt).toBe("2026-06-01T00:00:00.000Z");
    });

    it("404 when ownerExternalId is not provisioned", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles",
        headers: auth,
        payload: { name: "x", ownerExternalId: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("401 without the admin key", async () => {
      context = await createTestContext();
      const res = await context.app.inject({
        method: "POST",
        url: "/api/admin/circles",
        payload: { name: "x", ownerExternalId: "y" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/admin/circles/:circleId", () => {
    it("closes a contest and reflects status", async () => {
      context = await createTestContext();
      await provision(context, "owner-ext-2");
      const created = (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/circles",
          headers: auth,
          payload: { name: "C", ownerExternalId: "owner-ext-2" },
        })
      ).json();
      const circleId = created.circle.id as string;

      const res = await context.app.inject({
        method: "PATCH",
        url: `/api/admin/circles/${circleId}`,
        headers: auth,
        payload: { status: "closed" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().circle.status).toBe("closed");
    });

    it("disables a circle and reflects status", async () => {
      context = await createTestContext();
      await provision(context, "owner-ext-disable");
      const created = (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/circles",
          headers: auth,
          payload: { name: "Concurso", ownerExternalId: "owner-ext-disable" },
        })
      ).json();
      const circleId = created.circle.id as string;

      const res = await context.app.inject({
        method: "PATCH",
        url: `/api/admin/circles/${circleId}`,
        headers: auth,
        payload: { status: "disabled" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().circle.status).toBe("disabled");

      // Re-enabling is just another PATCH.
      const reenable = await context.app.inject({
        method: "PATCH",
        url: `/api/admin/circles/${circleId}`,
        headers: auth,
        payload: { status: "active" },
      });
      expect(reenable.json().circle.status).toBe("active");
    });

    it("400 when no fields are provided", async () => {
      context = await createTestContext();
      await provision(context, "owner-ext-3");
      const created = (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/circles",
          headers: auth,
          payload: { name: "C", ownerExternalId: "owner-ext-3" },
        })
      ).json();
      const res = await context.app.inject({
        method: "PATCH",
        url: `/api/admin/circles/${created.circle.id}`,
        headers: auth,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/admin/circles/:circleId/members/bulk", () => {
    it("classifies added / alreadyMembers / notProvisioned", async () => {
      context = await createTestContext();
      await provision(context, "owner-ext-4");
      await provision(context, "member-a");
      await provision(context, "member-b");
      const created = (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/circles",
          headers: auth,
          payload: { name: "C", ownerExternalId: "owner-ext-4" },
        })
      ).json();
      const circleId = created.circle.id as string;

      const res = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circleId}/members/bulk`,
        headers: auth,
        // owner-ext-4 already a member (owner); ghost not provisioned.
        payload: { externalIds: ["member-a", "member-b", "owner-ext-4", "ghost"] },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.added.sort()).toEqual(["member-a", "member-b"]);
      expect(body.alreadyMembers).toEqual(["owner-ext-4"]);
      expect(body.notProvisioned).toEqual(["ghost"]);

      // Idempotent: re-running adds nothing new.
      const again = await context.app.inject({
        method: "POST",
        url: `/api/admin/circles/${circleId}/members/bulk`,
        headers: auth,
        payload: { externalIds: ["member-a", "member-b"] },
      });
      expect(again.json().added).toEqual([]);
      expect(again.json().alreadyMembers.sort()).toEqual(["member-a", "member-b"]);
    });
  });
});

describe("assertCircleAcceptsCheckins (contest-window gate)", () => {
  const within = new Date("2026-06-15T12:00:00.000Z");

  it("passes for an active circle with no window", () => {
    expect(() =>
      assertCircleAcceptsCheckins({ status: "active", contestStartAt: null, contestEndAt: null }, within),
    ).not.toThrow();
  });

  it("throws when status is closed", () => {
    expect(() =>
      assertCircleAcceptsCheckins({ status: "closed", contestStartAt: null, contestEndAt: null }, within),
    ).toThrow(CircleClosedError);
  });

  it("throws when status is disabled", () => {
    expect(() =>
      assertCircleAcceptsCheckins({ status: "disabled", contestStartAt: null, contestEndAt: null }, within),
    ).toThrow(CircleClosedError);
  });

  it("throws before the window starts", () => {
    expect(() =>
      assertCircleAcceptsCheckins(
        { status: "active", contestStartAt: new Date("2026-06-20T00:00:00.000Z"), contestEndAt: null },
        within,
      ),
    ).toThrow(CircleClosedError);
  });

  it("throws after the window ends", () => {
    expect(() =>
      assertCircleAcceptsCheckins(
        { status: "active", contestStartAt: null, contestEndAt: new Date("2026-06-10T00:00:00.000Z") },
        within,
      ),
    ).toThrow(CircleClosedError);
  });

  it("passes within the window", () => {
    expect(() =>
      assertCircleAcceptsCheckins(
        {
          status: "active",
          contestStartAt: new Date("2026-06-01T00:00:00.000Z"),
          contestEndAt: new Date("2026-06-30T00:00:00.000Z"),
        },
        within,
      ),
    ).not.toThrow();
  });
});
