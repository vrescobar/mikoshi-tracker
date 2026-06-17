/**
 * Backfill plan + apply (story 51): legacy circles become cohort-linked.
 * The planner is pure (drives `--dry-run` exactly); apply runs against a
 * fake Mikoshi v1 mutation API and stamps cohortId locally.
 */
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "bun:test";

import {
  planCohortBackfill,
  applyCohortBackfill,
} from "../../src/modules/platform/cohort-backfill";
import { createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, type TestContext } from "../helpers/app";

describe("planCohortBackfill", () => {
  it("plans one cohort per unlinked circle with its externalId members (reference shape: 2 circles / 17 memberships)", () => {
    const circles = [
      { id: "c1", name: "Bikini 2026", cohortId: null },
      { id: "c2", name: "Salud", cohortId: null },
    ];
    // 17 memberships across the two circles, all with externalId — mirrors
    // the production reference counts pinned in mikoshi-stack/TASKS.md.
    const memberships = [
      ...Array.from({ length: 9 }, (_, i) => ({
        circleId: "c1",
        externalId: `ext-${i}`,
        role: i === 0 ? "owner" : "member",
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        circleId: "c2",
        externalId: `ext-${i + 20}`,
        role: i === 0 ? "owner" : "member",
      })),
    ];

    const plan = planCohortBackfill(circles, memberships);

    expect(plan.cohorts).toHaveLength(2);
    expect(plan.alreadyLinked).toBe(0);
    expect(plan.membershipsExamined).toBe(17);
    expect(plan.cohorts[0].memberExternalIds).toHaveLength(9);
    expect(plan.cohorts[1].memberExternalIds).toHaveLength(8);
    expect(plan.cohorts.map((c) => c.cohortName)).toEqual(["Bikini 2026", "Salud"]);
  });

  it("skips already-linked circles and keeps web-only memberships out of the cohort", () => {
    const plan = planCohortBackfill(
      [
        { id: "c1", name: "Linked", cohortId: "cohort-existing" },
        { id: "c2", name: "Mixed", cohortId: null },
      ],
      [
        { circleId: "c2", externalId: "ext-a", role: "owner" },
        { circleId: "c2", externalId: null, role: "member" }, // web-only
      ],
    );

    expect(plan.alreadyLinked).toBe(1);
    expect(plan.cohorts).toHaveLength(1);
    expect(plan.cohorts[0].memberExternalIds).toEqual(["ext-a"]);
    expect(plan.cohorts[0].webOnlyMemberships).toBe(1);
  });
});

describe("applyCohortBackfill", () => {
  let context: TestContext | undefined;
  let fakeMikoshi: FastifyInstance | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
    if (fakeMikoshi) {
      await fakeMikoshi.close();
      fakeMikoshi = undefined;
    }
  });

  it("creates the cohort in Mikoshi, adds members and links cohortId", async () => {
    const created: Array<{ name: string }> = [];
    const added: Array<{ cohortId: string; identityId: string }> = [];
    fakeMikoshi = fastify();
    fakeMikoshi.post("/api/v1/cohorts/create", async (request) => {
      created.push(request.body as { name: string });
      return { ok: true, data: { cohortId: `cohort-${created.length}` } };
    });
    fakeMikoshi.post<{ Params: { id: string } }>(
      "/api/v1/cohorts/:id/members/add",
      async (request) => {
        const { identityId } = request.body as { identityId: string };
        added.push({ cohortId: request.params.id, identityId });
        return { ok: true, data: { cohortId: request.params.id, identityId } };
      },
    );
    const address = await fakeMikoshi.listen({ port: 0, host: "127.0.0.1" });

    context = await createTestContext();
    const db = context.app.db;
    const owner = await context.app.db.user.create({
      data: {
        name: "Owner",
        email: "owner-backfill@example.com",
        emailVerified: true,
        externalId: "ext-owner",
      },
    });
    const circle = await createCircleRecord(context.app.sqlite, { ownerId: owner.id, name: "Backfill Circle" });
    await db.circleMembership.updateMany({
      where: { circleId: circle.id, userId: owner.id },
      data: { externalId: "ext-owner" },
    });

    const circles = await db.circle.findMany({ select: { id: true, name: true, cohortId: true } });
    const memberships = await db.circleMembership.findMany({
      select: { circleId: true, externalId: true, role: true },
    });
    const plan = planCohortBackfill(circles, memberships);
    const results = await applyCohortBackfill(context.app.sqlite, plan, { v1BaseUrl: `${address}/api/v1` });

    expect(created).toEqual([expect.objectContaining({ name: "Backfill Circle" })]);
    expect(added).toEqual([{ cohortId: "cohort-1", identityId: "ext-owner" }]);
    expect(results).toEqual([
      { circleId: circle.id, cohortId: "cohort-1", membersAdded: 1 },
    ]);
    const linked = await db.circle.findUnique({ where: { id: circle.id } });
    expect(linked?.cohortId).toBe("cohort-1");

    // Re-running the planner now finds nothing to do (idempotent resume).
    const replan = planCohortBackfill(
      await db.circle.findMany({ select: { id: true, name: true, cohortId: true } }),
      memberships,
    );
    expect(replan.cohorts).toHaveLength(0);
    expect(replan.alreadyLinked).toBe(1);
  });
});
