import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  addCircleMemberRecord,
  createCircleRecord,
} from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-provisioning";

async function provision(context: TestContext, externalId: string, name = externalId) {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/admin/provision-user",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, name },
  });
  return res.json() as { userId: string };
}

/** Provision an owner + create a circle they own (owner membership is auto-created). */
async function makeCircle(context: TestContext, name = "Operación Bikini") {
  const owner = await provision(context, "ext-owner", "Owner");
  const circle = await createCircleRecord(context.app.sqlite, { ownerId: owner.userId, name });
  return { circle, owner };
}

/** Provision a user and enrol them as a member of the circle. */
async function enrol(context: TestContext, circleId: string, externalId: string, name = externalId) {
  const user = await provision(context, externalId, name);
  await addCircleMemberRecord(context.app.sqlite, { circleId, userId: user.userId, externalId });
  return user;
}

function assign(context: TestContext, circleId: string, payload: unknown, key = ADMIN_KEY) {
  return context.app.inject({
    method: "POST",
    url: `/api/admin/circles/${circleId}/assign-habit`,
    headers: { authorization: `Bearer ${key}` },
    payload: payload as Record<string, unknown>,
  });
}

describe("admin assign-habit", () => {
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

  describe("mode `habit` (create + share)", () => {
    it("creates the habit as the member and shares it into the circle (201)", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      const member = await enrol(context, circle.id, "ext-mj", "MJ");

      const res = await assign(context, circle.id, {
        externalId: "ext-mj",
        habit: {
          name: "Mínimo 4 sesiones de fuerza/semana + ≥5 km de carrera",
          frequency: { type: "weekly_count", count: 4 },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        userId: member.userId,
        created: true,
        shared: true,
        alreadyShared: false,
      });

      // The Entry belongs to the member, and a CircleEntryShare links it to the circle.
      const entry = await context.app.db.entry.findUnique({ where: { id: body.habitId } });
      expect(entry?.userId).toBe(member.userId);
      expect(entry?.name).toBe("Mínimo 4 sesiones de fuerza/semana + ≥5 km de carrera");
      const share = await context.app.db.circleEntryShare.findFirst({
        where: { circleId: circle.id, entryId: body.habitId },
      });
      expect(share).not.toBeNull();
    });
  });

  describe("mode `habitId` (share existing)", () => {
    it("shares an existing habit owned by the member into the circle (200)", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      const member = await enrol(context, circle.id, "ext-elafo", "eLafo");
      const habit = await createHabit(
        { db: context.app.sqlite, sqlite: context.app.sqlite },
        {
          userId: member.userId,
          input: { name: "Fuerza y movilidad 3x semana", frequency: { type: "weekly_count", count: 3 } },
          today: "2026-06-01",
        },
      );

      const res = await assign(context, circle.id, { externalId: "ext-elafo", habitId: habit.id });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        userId: member.userId,
        habitId: habit.id,
        created: false,
        shared: true,
        alreadyShared: false,
      });
      const share = await context.app.db.circleEntryShare.findFirst({
        where: { circleId: circle.id, entryId: habit.id },
      });
      expect(share).not.toBeNull();
    });

    it("is idempotent: re-sharing the same habit returns alreadyShared: true", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      const member = await enrol(context, circle.id, "ext-sete", "Sete");
      const habit = await createHabit(
        { db: context.app.sqlite, sqlite: context.app.sqlite },
        { userId: member.userId, input: { name: "CrossFit 3x", frequency: { type: "weekly_count", count: 3 } }, today: "2026-06-01" },
      );

      const first = await assign(context, circle.id, { externalId: "ext-sete", habitId: habit.id });
      expect(first.statusCode).toBe(200);
      expect(first.json().alreadyShared).toBe(false);

      const second = await assign(context, circle.id, { externalId: "ext-sete", habitId: habit.id });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ habitId: habit.id, shared: true, alreadyShared: true });

      // Still exactly one share row.
      const shares = await context.app.db.circleEntryShare.findMany({
        where: { circleId: circle.id, entryId: habit.id },
      });
      expect(shares).toHaveLength(1);
    });

    it("404 when the habitId is not owned by the member", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      await enrol(context, circle.id, "ext-anna", "Anna");
      // Habit belongs to a DIFFERENT member.
      const other = await enrol(context, circle.id, "ext-other", "Other");
      const foreignHabit = await createHabit(
        { db: context.app.sqlite, sqlite: context.app.sqlite },
        { userId: other.userId, input: { name: "Ajeno", frequency: { type: "daily" } }, today: "2026-06-01" },
      );

      const res = await assign(context, circle.id, { externalId: "ext-anna", habitId: foreignHabit.id });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("validation & auth", () => {
    it("404 when the circle does not exist", async () => {
      context = await createTestContext();
      await provision(context, "ext-x", "X");
      const res = await assign(context, "circle-does-not-exist", {
        externalId: "ext-x",
        habit: { name: "h", frequency: { type: "daily" } },
      });
      expect(res.statusCode).toBe(404);
    });

    it("404 when the externalId has no provisioned user", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      const res = await assign(context, circle.id, {
        externalId: "ext-ghost",
        habit: { name: "h", frequency: { type: "daily" } },
      });
      expect(res.statusCode).toBe(404);
    });

    it("400 when the user is not a member of the circle", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      await provision(context, "ext-outsider", "Outsider"); // provisioned but NOT enrolled
      const res = await assign(context, circle.id, {
        externalId: "ext-outsider",
        habit: { name: "h", frequency: { type: "daily" } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("NOT_A_MEMBER");
    });

    it("400 when neither habit nor habitId is provided", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      await enrol(context, circle.id, "ext-empty", "Empty");
      const res = await assign(context, circle.id, { externalId: "ext-empty" });
      expect(res.statusCode).toBe(400);
    });

    it("400 when both habit and habitId are provided", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      await enrol(context, circle.id, "ext-both", "Both");
      const res = await assign(context, circle.id, {
        externalId: "ext-both",
        habit: { name: "h", frequency: { type: "daily" } },
        habitId: "some-id",
      });
      expect(res.statusCode).toBe(400);
    });

    it("401 without the admin key", async () => {
      context = await createTestContext();
      const { circle } = await makeCircle(context);
      await enrol(context, circle.id, "ext-noauth", "NoAuth");
      const res = await assign(
        context,
        circle.id,
        { externalId: "ext-noauth", habit: { name: "h", frequency: { type: "daily" } } },
        "wrong-key",
      );
      expect(res.statusCode).toBe(401);
    });
  });
});
