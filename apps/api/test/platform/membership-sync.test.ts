/**
 * Cohorts = roster (story 51): Mikoshi cohorts are the source of truth of who
 * is in a circle; CircleMembership becomes a derived cache.
 *
 *  - `reconcileCircleRoster` applies a roster pulled/pushed from Mikoshi:
 *    provisioned members appear, members no longer in the cohort stop scoring
 *    (membership row removed) but KEEP their historical data, the owner and
 *    web-only members are never touched, unprovisioned members are skipped.
 *  - `POST /api/platform/membership` is the admin-gated push variant.
 *  - provision with `cohorts` hints enrols the user into linked circles.
 *  - issuing a magic link (SSO) refreshes every cohort-linked circle by
 *    pulling `GET {platform}/cohorts/:id/members` from Mikoshi.
 */
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { reconcileCircleRoster } from "../../src/modules/platform/membership-sync";
import { createCircleRecord, addCircleMemberRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-roster";

async function provision(context: TestContext, externalId: string, displayName: string) {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/platform/provision",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, displayName },
  });
  return response.json().userId as string;
}

/** Provisioned owner + circle linked to a cohort. */
async function makeLinkedCircle(context: TestContext, cohortId: string) {
  const ownerId = await provision(context, `ext-owner-${cohortId}`, "Owner");
  const circle = await createCircleRecord(context.app.db, { ownerId, name: `Circle ${cohortId}` });
  await context.app.db.circle.update({ where: { id: circle.id }, data: { cohortId } });
  return { circle, ownerId };
}

describe("membership sync (cohorts = roster)", () => {
  let context: TestContext | undefined;
  let fakeMikoshi: FastifyInstance | undefined;

  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  });

  afterEach(async () => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    if (context) {
      await context.cleanup();
      context = undefined;
    }
    if (fakeMikoshi) {
      await fakeMikoshi.close();
      fakeMikoshi = undefined;
    }
  });

  describe("reconcileCircleRoster", () => {
    it("enrols provisioned roster members, skips unprovisioned ones", async () => {
      context = await createTestContext();
      const { circle } = await makeLinkedCircle(context, "cohort-a");
      await provision(context, "ext-alice", "Alice");

      const result = await reconcileCircleRoster(context.app.db, circle.id, [
        { externalId: "ext-alice", displayName: "Alice" },
        { externalId: "ext-ghost", displayName: "Ghost" },
      ]);

      expect(result.added).toEqual(["ext-alice"]);
      expect(result.skippedUnprovisioned).toEqual(["ext-ghost"]);
      const memberships = await context.app.db.circleMembership.findMany({
        where: { circleId: circle.id },
      });
      expect(memberships).toHaveLength(2); // owner + alice
      expect(memberships.find((m) => m.externalId === "ext-alice")).toBeTruthy();
    });

    it("a member retired from the cohort stops scoring but keeps historical data", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const { circle } = await makeLinkedCircle(context, "cohort-b");
      const bobId = await provision(context, "ext-bob", "Bob");
      await addCircleMemberRecord(db, { circleId: circle.id, userId: bobId, externalId: "ext-bob" });
      // Historical traces: a leaderboard snapshot and an entry owned by Bob.
      await db.circleLeaderboardSnapshot.create({
        data: { circleId: circle.id, season: "s1", userId: bobId, rank: 1, score: 10, data: "{}" },
      });
      const entryType = await db.entryType.findFirst({ select: { id: true } });
      await db.entry.create({
        data: {
          userId: bobId,
          entryTypeId: entryType!.id,
          name: "Hist",
          config: "{}",
          startDate: "2026-01-01",
        },
      });

      const result = await reconcileCircleRoster(db, circle.id, []);

      expect(result.removed).toEqual(["ext-bob"]);
      const membership = await db.circleMembership.findFirst({
        where: { circleId: circle.id, userId: bobId },
      });
      expect(membership).toBeNull();
      // Data survives: snapshot, entry and the user row itself.
      expect(await db.circleLeaderboardSnapshot.count({ where: { userId: bobId } })).toBe(1);
      expect(await db.entry.count({ where: { userId: bobId } })).toBe(1);
      expect(await db.user.findUnique({ where: { id: bobId } })).not.toBeNull();
    });

    it("never removes the owner nor web-only memberships (externalId null)", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const { circle, ownerId } = await makeLinkedCircle(context, "cohort-c");
      // Web-only member: user without externalId-bearing membership.
      const web = await db.user.create({
        data: { name: "Webby", email: "webby@example.com", emailVerified: true },
      });
      await db.circleMembership.create({
        data: { circleId: circle.id, userId: web.id, role: "member", externalId: null },
      });

      const result = await reconcileCircleRoster(db, circle.id, []);

      expect(result.removed).toEqual([]);
      const remaining = await db.circleMembership.findMany({ where: { circleId: circle.id } });
      expect(remaining.map((m) => m.userId).sort()).toEqual([ownerId, web.id].sort());
    });

    it("is idempotent: a second pass with the same roster changes nothing", async () => {
      context = await createTestContext();
      const { circle } = await makeLinkedCircle(context, "cohort-d");
      await provision(context, "ext-carol", "Carol");
      const roster = [{ externalId: "ext-carol", displayName: "Carol" }];

      await reconcileCircleRoster(context.app.db, circle.id, roster);
      const second = await reconcileCircleRoster(context.app.db, circle.id, roster);

      expect(second.added).toEqual([]);
      expect(second.removed).toEqual([]);
    });
  });

  describe("POST /api/platform/membership (push)", () => {
    it("applies the pushed roster to the circle linked to the cohort", async () => {
      context = await createTestContext();
      const { circle } = await makeLinkedCircle(context, "cohort-push");
      await provision(context, "ext-dave", "Dave");

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/membership",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: {
          cohortId: "cohort-push",
          members: [{ externalId: "ext-dave", displayName: "Dave" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        cohortId: "cohort-push",
        added: ["ext-dave"],
        removed: [],
        skippedUnprovisioned: [],
      });
      const membership = await context.app.db.circleMembership.findFirst({
        where: { circleId: circle.id, externalId: "ext-dave" },
      });
      expect(membership).not.toBeNull();
    });

    it("404 for an unknown cohortId, 401 without the admin key", async () => {
      context = await createTestContext();

      const unknown = await context.app.inject({
        method: "POST",
        url: "/api/platform/membership",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { cohortId: "cohort-nope", members: [] },
      });
      expect(unknown.statusCode).toBe(404);

      const noAuth = await context.app.inject({
        method: "POST",
        url: "/api/platform/membership",
        payload: { cohortId: "cohort-push", members: [] },
      });
      expect(noAuth.statusCode).toBe(401);
    });
  });

  describe("provision with cohort hints", () => {
    it("enrols the provisioned user into the circle linked to the hinted cohort", async () => {
      context = await createTestContext();
      const { circle } = await makeLinkedCircle(context, "cohort-hint");

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: {
          externalId: "ext-eve",
          displayName: "Eve",
          cohorts: [
            { cohortId: "cohort-hint", name: "Hinted" },
            { cohortId: "cohort-without-circle", name: "No circle yet" },
          ],
        },
      });
      expect(response.statusCode).toBe(201);

      const membership = await context.app.db.circleMembership.findFirst({
        where: { circleId: circle.id, externalId: "ext-eve" },
      });
      expect(membership).not.toBeNull();
    });
  });

  describe("SSO pull", () => {
    it("issuing a magic link refreshes cohort-linked circles from Mikoshi", async () => {
      // Fake Mikoshi Platform API serving the cohort roster.
      const requests: Array<{ url: string; authorization?: string }> = [];
      fakeMikoshi = fastify();
      fakeMikoshi.get("/api/platform/v1/cohorts/:id/members", async (request) => {
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
        });
        return [
          { externalId: "ext-frank", displayName: "Frank" },
        ];
      });
      const address = await fakeMikoshi.listen({ port: 0, host: "127.0.0.1" });

      context = await createTestContext({
        MIKOSHI_PLATFORM_API_URL: `${address}/api/platform/v1`,
      });
      const { circle } = await makeLinkedCircle(context, "cohort-sso");
      await provision(context, "ext-frank", "Frank");

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-frank" },
      });
      expect(response.statusCode).toBe(201);

      // The pull hit Mikoshi with the shared admin key…
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain("/cohorts/cohort-sso/members");
      expect(requests[0].authorization).toBe(`Bearer ${ADMIN_KEY}`);
      // …and the roster materialised as a membership.
      const membership = await context.app.db.circleMembership.findFirst({
        where: { circleId: circle.id, externalId: "ext-frank" },
      });
      expect(membership).not.toBeNull();
    });

    it("an unreachable Mikoshi never blocks the magic link (best-effort)", async () => {
      context = await createTestContext({
        // Nothing listens here — the pull must fail silently.
        MIKOSHI_PLATFORM_API_URL: "http://127.0.0.1:1/api/platform/v1",
      });
      await makeLinkedCircle(context, "cohort-down");
      await provision(context, "ext-grace", "Grace");

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-grace" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().url).toMatch(/\/magic\?t=/);
    });
  });
});
