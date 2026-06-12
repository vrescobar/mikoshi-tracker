/**
 * Identity lifecycle (story 52): when Mikoshi merges two identities, tracker
 * follows — lazily (sweeping its stored externalIds against
 * `GET /identities/:id` and reacting to `{merged: true, survivorId}`) and
 * push-driven (`POST /hooks/identity`, HMAC-signed with the shared admin key
 * over `timestamp + "." + rawBody`, 5-min anti-replay window).
 *
 *  - both externalIds have a User → full merge with user-merge semantics
 *    (entries summed onto the survivor, orphan row deleted);
 *  - only the orphan exists → simple re-key of externalId;
 *  - bad/stale/tampered signature → 401 and nothing changes.
 */
import { createHmac } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, type TestContext } from "../helpers/app";

const ADMIN_KEY = "test-admin-key-for-identity";

function sign(adminKey: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", adminKey).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

async function provision(context: TestContext, externalId: string, displayName: string) {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/platform/provision",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
    payload: { externalId, displayName },
  });
  return response.json().userId as string;
}

async function addEntry(context: TestContext, userId: string, name: string) {
  const entryType = await context.app.db.entryType.findFirst({ select: { id: true } });
  await context.app.db.entry.create({
    data: { userId, entryTypeId: entryType!.id, name, config: "{}", startDate: "2026-01-01" },
  });
}

function mergedWebhookInject(
  context: TestContext,
  body: Record<string, unknown>,
  opts: { timestamp?: string; signature?: string } = {},
) {
  const rawBody = JSON.stringify(body);
  const timestamp = opts.timestamp ?? String(Date.now());
  const signature = opts.signature ?? sign(ADMIN_KEY, timestamp, rawBody);
  return context.app.inject({
    method: "POST",
    url: "/hooks/identity",
    headers: {
      "content-type": "application/json",
      "x-mikoshi-timestamp": timestamp,
      "x-mikoshi-signature": signature,
    },
    payload: rawBody,
  });
}

describe("identity lifecycle (story 52)", () => {
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

  describe("POST /hooks/identity (push)", () => {
    it("merges fully when both externalIds have users — entries summed, orphan row gone", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const orphanUserId = await provision(context, "ext-orphan-1", "Orphan");
      const survivorUserId = await provision(context, "ext-survivor-1", "Survivor");
      await addEntry(context, orphanUserId, "from-orphan");
      await addEntry(context, survivorUserId, "from-survivor");

      const response = await mergedWebhookInject(context, {
        event: "identity.merged",
        orphanExternalId: "ext-orphan-1",
        survivorExternalId: "ext-survivor-1",
        mergedAt: new Date().toISOString(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, action: "merged" });
      // Orphan row deleted, survivor keeps its externalId and BOTH entries.
      expect(await db.user.findUnique({ where: { id: orphanUserId } })).toBeNull();
      const survivor = await db.user.findUnique({ where: { id: survivorUserId } });
      expect(survivor?.externalId).toBe("ext-survivor-1");
      expect(await db.entry.count({ where: { userId: survivorUserId } })).toBe(2);
    });

    it("re-keys when only the orphan exists", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const userId = await provision(context, "ext-orphan-2", "Solo");

      const response = await mergedWebhookInject(context, {
        event: "identity.merged",
        orphanExternalId: "ext-orphan-2",
        survivorExternalId: "ext-survivor-2",
        mergedAt: new Date().toISOString(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, action: "re-keyed" });
      const user = await db.user.findUnique({ where: { id: userId } });
      expect(user?.externalId).toBe("ext-survivor-2");
    });

    it("is a no-op when the orphan is unknown", async () => {
      context = await createTestContext();

      const response = await mergedWebhookInject(context, {
        event: "identity.merged",
        orphanExternalId: "ext-nobody",
        survivorExternalId: "ext-anybody",
        mergedAt: new Date().toISOString(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, action: "noop" });
    });

    it("rejects invalid, stale and tampered signatures with 401 — and nothing changes", async () => {
      context = await createTestContext();
      const db = context.app.db;
      const userId = await provision(context, "ext-orphan-3", "Target");
      const body = {
        event: "identity.merged",
        orphanExternalId: "ext-orphan-3",
        survivorExternalId: "ext-survivor-3",
        mergedAt: new Date().toISOString(),
      };

      // Wrong key.
      const wrongKey = await mergedWebhookInject(context, body, {
        signature: sign("not-the-admin-key", String(Date.now()), JSON.stringify(body)),
      });
      expect(wrongKey.statusCode).toBe(401);

      // Stale timestamp (outside the 5-min window) — correctly signed.
      const staleTs = String(Date.now() - 6 * 60_000);
      const stale = await mergedWebhookInject(context, body, {
        timestamp: staleTs,
        signature: sign(ADMIN_KEY, staleTs, JSON.stringify(body)),
      });
      expect(stale.statusCode).toBe(401);

      // Tampered body: signature of a DIFFERENT payload.
      const ts = String(Date.now());
      const tampered = await mergedWebhookInject(context, body, {
        timestamp: ts,
        signature: sign(ADMIN_KEY, ts, JSON.stringify({ ...body, orphanExternalId: "x" })),
      });
      expect(tampered.statusCode).toBe(401);

      // Missing headers entirely.
      const bare = await context.app.inject({
        method: "POST",
        url: "/hooks/identity",
        payload: body,
      });
      expect(bare.statusCode).toBe(401);

      const untouched = await db.user.findUnique({ where: { id: userId } });
      expect(untouched?.externalId).toBe("ext-orphan-3");
    });
  });

  describe("lazy reconciliation", () => {
    function fakeMikoshiWithTombstone(orphanId: string, survivorId: string) {
      const server = fastify();
      server.get<{ Params: { id: string } }>(
        "/api/platform/v1/identities/:id",
        async (request, reply) => {
          if (request.params.id === orphanId) {
            return { merged: true, survivorId, identity: { externalId: survivorId } };
          }
          return reply.status(404).send({ error: "not found" });
        },
      );
      return server;
    }

    it("provision of an unknown externalId sweeps local ids and re-keys instead of duplicating the human", async () => {
      fakeMikoshi = fakeMikoshiWithTombstone("ext-old-4", "ext-new-4");
      const address = await fakeMikoshi.listen({ port: 0, host: "127.0.0.1" });
      context = await createTestContext({
        MIKOSHI_PLATFORM_API_URL: `${address}/api/platform/v1`,
      });
      const originalUserId = await provision(context, "ext-old-4", "Olda");

      // Mikoshi now provisions with the SURVIVOR id (it merged ext-old-4 in).
      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/provision",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-new-4", displayName: "Olda" },
      });

      expect(response.statusCode).toBe(200); // existing user found after re-key
      expect(response.json()).toMatchObject({ created: false, userId: originalUserId });
      const user = await context.app.db.user.findUnique({ where: { id: originalUserId } });
      expect(user?.externalId).toBe("ext-new-4");
      expect(await context.app.db.user.count()).toBe(1);
    });

    it("issue-magic-link for the survivor id works after the lazy re-key", async () => {
      fakeMikoshi = fakeMikoshiWithTombstone("ext-old-5", "ext-new-5");
      const address = await fakeMikoshi.listen({ port: 0, host: "127.0.0.1" });
      context = await createTestContext({
        MIKOSHI_PLATFORM_API_URL: `${address}/api/platform/v1`,
      });
      await provision(context, "ext-old-5", "Linker");

      const response = await context.app.inject({
        method: "POST",
        url: "/api/platform/issue-magic-link",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
        payload: { externalId: "ext-new-5" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().url).toMatch(/\/magic\?t=/);
    });
  });
});
