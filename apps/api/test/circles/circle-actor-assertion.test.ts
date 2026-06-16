import { afterEach, describe, expect, it } from "vitest";

import { signActorAssertion } from "../../src/auth/actor-assertion";
import { createCircleToken } from "../../src/auth/circle-token";
import {
  addCircleMemberRecord,
  createCircleHabitShareRecord,
  createCircleRecord,
} from "../../src/modules/circles/circle.repository";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

/**
 * AUTH-3 — enforcement server-side de actor (self-or-owner) en escrituras de
 * círculo, vía aserción firmada por el kernel. Rollout en 2 fases: A
 * (acepta-y-prefiere) y B (enforce con MIKOSHI_TRACKER_REQUIRE_ACTOR=1).
 */
const ADMIN_KEY = "actor-test-admin-key-0123456789ab";

async function setup(context: TestContext) {
  process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  const { body: alice } = await signUp(context.app);
  const ownerId = alice.user.id;
  const circle = await createCircleRecord(context.app.db, { ownerId, name: "Círculo" });
  // El owner necesita externalId para que la aserción de actor lo resuelva.
  await context.app.db.circleMembership.update({
    where: { circleId_userId: { circleId: circle.id, userId: ownerId } },
    data: { externalId: "ext-owner" },
  });

  const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
  const bobId = bob.user.id;
  await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bobId, externalId: "ext-bob" });

  const { token } = await createCircleToken(context.app.db, circle.id);

  const ownerHabit = await createHabit(
    { db: context.app.db },
    { userId: ownerId, input: { name: "Run", frequency: { type: "daily" } }, today: "2026-05-01" },
  );
  const bobHabit = await createHabit(
    { db: context.app.db },
    { userId: bobId, input: { name: "Read", frequency: { type: "daily" } }, today: "2026-05-01" },
  );
  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: ownerHabit.id });
  await createCircleHabitShareRecord(context.app.db, { circleId: circle.id, habitId: bobHabit.id });

  return { circle, token, ownerId, bobId, ownerHabit, bobHabit };
}

function actorHeaders(externalId: string, circleId: string, token: string, opts: { ts?: string; sig?: string } = {}) {
  const ts = opts.ts ?? String(Date.now());
  const sig = opts.sig ?? signActorAssertion(ADMIN_KEY, ts, externalId, circleId);
  return {
    authorization: `Bearer ${token}`,
    "x-mikoshi-actor": externalId,
    "x-mikoshi-actor-timestamp": ts,
    "x-mikoshi-actor-signature": sig,
  };
}

const complete = (circleId: string, userId: string, habitId: string) =>
  `/api/circles/${circleId}/members/${userId}/habits/${habitId}/complete`;

describe("AUTH-3 actor assertion (circle writes)", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    delete process.env.MIKOSHI_TRACKER_REQUIRE_ACTOR;
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("aserción FORJADA (firma mala) → 403, incluso en Fase A", async () => {
    context = await createTestContext();
    const { circle, token, ownerId, ownerHabit } = await setup(context);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, ownerId, ownerHabit.id),
      headers: actorHeaders("ext-owner", circle.id, token, { sig: "sha256=deadbeef" }),
    });
    expect(res.statusCode).toBe(403);
    // El código distingue el fallo de ACTOR del rechazo del token del círculo:
    // colapsarlos en "token caducado" fue lo que despistó en el incidente bikini.
    expect(res.json().code).toBe("ACTOR_INVALID");
  });

  it("cross-member por un NO-owner → 403 (bob escribe sobre el owner)", async () => {
    context = await createTestContext();
    const { circle, token, ownerId, ownerHabit } = await setup(context);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, ownerId, ownerHabit.id),
      headers: actorHeaders("ext-bob", circle.id, token),
    });
    expect(res.statusCode).toBe(403);
  });

  it("self write (bob sobre su propio hábito) → 200", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: actorHeaders("ext-bob", circle.id, token),
    });
    expect(res.statusCode).toBe(200);
  });

  it("owner-de-otros (owner escribe sobre bob) → 200", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: actorHeaders("ext-owner", circle.id, token),
    });
    expect(res.statusCode).toBe(200);
  });

  it("aserción para OTRO círculo → 403 (circleId va firmado)", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    const sig = signActorAssertion(ADMIN_KEY, String(Date.now()), "ext-bob", "otro-circulo");
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: actorHeaders("ext-bob", circle.id, token, { sig }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("replay: timestamp fuera de la ventana de 5 min → 403", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    const oldTs = String(Date.now() - 6 * 60_000);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: actorHeaders("ext-bob", circle.id, token, { ts: oldTs }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("Fase A: ausencia de aserción → 200 (paridad legacy)", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("Fase B: ausencia de aserción con REQUIRE_ACTOR=1 → 403", async () => {
    context = await createTestContext();
    const { circle, token, bobId, bobHabit } = await setup(context);
    process.env.MIKOSHI_TRACKER_REQUIRE_ACTOR = "1";
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, bobId, bobHabit.id),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACTOR_REQUIRED");
  });

  it("código distingue ACTOR vs TOKEN: token de círculo inválido → UNAUTHORIZED, no ACTOR_*", async () => {
    context = await createTestContext();
    const { circle, ownerId, ownerHabit } = await setup(context);
    process.env.MIKOSHI_TRACKER_REQUIRE_ACTOR = "1";
    // Token de círculo basura: el fallo es del TOKEN, no de la aserción de actor.
    const res = await context.app.inject({
      method: "POST",
      url: complete(circle.id, ownerId, ownerHabit.id),
      headers: { authorization: "Bearer not-a-real-circle-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHORIZED");
  });
});
