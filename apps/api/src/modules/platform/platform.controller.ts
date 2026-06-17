/**
 * Handlers of the extensions-platform contract namespace (stories 50–51):
 * `POST /api/platform/provision` and `POST /api/platform/membership` speak
 * the contract shapes of `~/projects/mikoshi-stack/docs/contract-summary.md`,
 * gated by the same admin credential resolution as the legacy `/api/admin/*`
 * routes.
 *
 * Divergences from the generic contract, on purpose:
 *   - `phone` is accepted but not persisted — User has no phone column and
 *     Mikoshi remains the source of truth for contact data.
 *   - `displayName` only self-heals a placeholder name (name === externalId);
 *     tracker users can rename themselves in the web app and a WhatsApp
 *     re-enrol must not clobber that.
 *   - the personal token is rotated on EVERY provision, so the caller always
 *     walks away with a working credential (parity with the legacy
 *     provision-user + reset-token round-trip).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  platformMembershipInputSchema,
  platformProvisionInputSchema,
  type PlatformProvisionInput,
} from "@mikoshi-tracker/contracts/platform";

import { z, ZodError } from "zod";

import { requireAdminKey } from "../../auth/admin-key";
import { resetPersonalApiToken } from "../../auth/api-token";
import {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../../auth/webhook-signature";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { addCircleMemberRecord } from "../circles/circle.repository";
import { getUserByExternalId } from "../users/user.repository";
import { newId, nowDb } from "../../db/rows";
import { sendAdminError } from "../admin/admin.controller";
import { reconcileMergedIdentity, sweepMergedIdentities } from "./identity-lifecycle";
import { pullCircleRoster, reconcileCircleRoster } from "./membership-sync";

/**
 * Deterministic synthetic email for API-only provisioned users — same
 * derivation as the legacy provision handler so a user provisioned via either
 * namespace gets the same address.
 */
function syntheticProvisionEmail(externalId: string): string {
  const emailHash = createHash("sha256").update(externalId).digest("hex").slice(0, 24);
  return `provisioned-${emailHash}@mikoshi-tracker.internal`;
}

/**
 * Cohort hints (story 51): the provision payload may carry the cohorts the
 * identity belongs to. For every cohort already linked to a circle, enrol the
 * user directly (the hint is an admin-authenticated statement of membership)
 * and then pull the full roster for freshness when the Platform API client is
 * configured. Cohorts without a linked circle are ignored — circle creation
 * stays an explicit operation (backfill/admin) because it needs an owner.
 */
async function applyCohortHints(
  request: FastifyRequest,
  userId: string,
  externalId: string,
  cohorts: PlatformProvisionInput["cohorts"],
): Promise<void> {
  if (!cohorts || cohorts.length === 0) return;
  const db = request.server.sqlite;

  for (const hint of cohorts) {
    const circle = db.get<{ id: string }>(`SELECT "id" FROM "Circle" WHERE "cohortId" = ? LIMIT 1`, [hint.cohortId]);
    if (!circle) continue;

    const existing = db.get<{ id: string; externalId: string | null }>(
      `SELECT "id", "externalId" FROM "CircleMembership" WHERE "circleId" = ? AND "userId" = ? LIMIT 1`,
      [circle.id, userId],
    );
    try {
      if (!existing) {
        await addCircleMemberRecord(db, { circleId: circle.id, userId, externalId });
      } else if (!existing.externalId) {
        db.run(`UPDATE "CircleMembership" SET "externalId" = ? WHERE "id" = ?`, [externalId, existing.id]);
      }
    } catch {
      // Concurrent enrol (unique(circleId, externalId/userId)) — already in; ignore.
    }

    const client = request.server.mikoshiPlatform;
    if (client) {
      await pullCircleRoster(db, client, { id: circle.id, cohortId: hint.cohortId });
    }
  }
}

export async function platformProvisionHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = platformProvisionInputSchema.parse(request.body);
    const db = request.server.sqlite;

    let existing = getUserByExternalId(db, input.externalId);

    // Lazy merge net (story 52): an unknown externalId may be the SURVIVOR of
    // a Mikoshi merge whose orphan we still hold. Sweep our stored ids before
    // creating a fresh row — re-keying beats duplicating the human.
    if (!existing && request.server.mikoshiPlatform) {
      await sweepMergedIdentities(db, request.server.mikoshiPlatform);
      existing = getUserByExternalId(db, input.externalId);
    }

    if (existing) {
      const sets: string[] = [];
      const args: unknown[] = [];
      if (
        input.displayName &&
        input.displayName !== input.externalId &&
        existing.name === input.externalId
      ) {
        sets.push(`"name" = ?`);
        args.push(input.displayName);
      }
      if (input.timezone) {
        sets.push(`"timezone" = ?`);
        args.push(normalizeUserTimeZone(input.timezone));
      }
      if (sets.length > 0) {
        sets.push(`"updatedAt" = ?`);
        args.push(nowDb());
        args.push(existing.id);
        db.run(`UPDATE "User" SET ${sets.join(", ")} WHERE "id" = ?`, args);
      }

      const { token } = await resetPersonalApiToken(request.server.sqlite, existing.id);
      await applyCohortHints(request, existing.id, input.externalId, input.cohorts);
      reply.status(200);
      return { created: false, userId: existing.id, personalToken: token };
    }

    try {
      const userId = newId();
      const now = nowDb();
      db.run(
        `INSERT INTO "User" ("id", "name", "email", "emailVerified", "timezone", "externalId", "createdAt", "updatedAt")
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          userId,
          input.displayName ?? input.externalId,
          syntheticProvisionEmail(input.externalId),
          normalizeUserTimeZone(input.timezone),
          input.externalId,
          now,
          now,
        ],
      );
      const { token } = await resetPersonalApiToken(request.server.sqlite, userId);
      await applyCohortHints(request, userId, input.externalId, input.cohorts);

      reply.status(201);
      return { created: true, userId, personalToken: token };
    } catch (createError) {
      // Concurrent provisions: both miss the existence check, second insert hits
      // the UNIQUE constraint. Resolve idempotently — and still rotate a token so
      // the response keeps the contract's "always a working credential".
      const race = getUserByExternalId(db, input.externalId);
      if (race) {
        const { token } = await resetPersonalApiToken(request.server.sqlite, race.id);
        await applyCohortHints(request, race.id, input.externalId, input.cohorts);
        reply.status(200);
        return { created: false, userId: race.id, personalToken: token };
      }
      throw createError;
    }
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

/**
 * Push variant of the roster sync: Mikoshi posts the full member list of a
 * cohort and the linked circle reconciles to it.
 */
export async function platformMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = platformMembershipInputSchema.parse(request.body);
    const db = request.server.sqlite;

    const circle = db.get<{ id: string }>(`SELECT "id" FROM "Circle" WHERE "cohortId" = ? LIMIT 1`, [input.cohortId]);
    if (!circle) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No circle is linked to that cohortId",
      });
    }

    const result = await reconcileCircleRoster(db, circle.id, input.members);
    return { cohortId: input.cohortId, ...result };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

const identityMergedEventSchema = z.object({
  event: z.literal("identity.merged"),
  orphanExternalId: z.string().trim().min(1),
  survivorExternalId: z.string().trim().min(1),
  mergedAt: z.string(),
});

/**
 * Push leg of the identity lifecycle (story 52): Mikoshi best-effort POSTs
 * `identity.merged` here, signed with the shared admin key. The signature IS
 * the credential (no bearer): HMAC over `timestamp + "." + rawBody`, 5-min
 * anti-replay window, verified on the raw bytes stashed by the JSON parser.
 */
export async function identityWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  if (!adminKey) {
    return reply.status(503).send({
      code: "SERVICE_UNAVAILABLE",
      message: "Identity webhook is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not set)",
    });
  }

  const timestamp = request.headers[WEBHOOK_TIMESTAMP_HEADER];
  const signature = request.headers[WEBHOOK_SIGNATURE_HEADER];
  const valid =
    typeof timestamp === "string" &&
    typeof signature === "string" &&
    typeof request.rawBody === "string" &&
    verifyWebhookSignature({
      adminKey,
      timestamp,
      rawBody: request.rawBody,
      signature,
    });
  if (!valid) {
    return reply.status(401).send({
      code: "UNAUTHORIZED",
      message: "Invalid webhook signature",
    });
  }

  try {
    const event = identityMergedEventSchema.parse(request.body);
    const action = await reconcileMergedIdentity(request.server.sqlite, {
      orphanExternalId: event.orphanExternalId,
      survivorExternalId: event.survivorExternalId,
    });
    return { ok: true, action };
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "BAD_REQUEST",
        message: "Invalid identity event payload",
        issues: error.flatten(),
      });
    }
    throw error;
  }
}

/** `file:/abs/path.db?params` → `/abs/path.db`. Null si no es un file URL. */
function sqliteFilePathFromUrl(url: string | undefined): string | null {
  if (!url || !url.startsWith("file:")) return null;
  return url.slice("file:".length).split("?")[0] || null;
}

/**
 * Snapshot-pull de respaldo (BKP-1): SOLO Mikoshi puede dispararlo. La firma
 * HMAC sobre el body (misma postura que /hooks/identity) ES la credencial — un
 * caller sin la admin key no produce una firma válida → 401. Devuelve un dump
 * CONSISTENTE de la DB (VACUUM INTO sobre un handle bun:sqlite directo) como
 * octet stream; el kernel lo guarda local en data/ext-backups/tracker/.
 */
export async function platformBackupHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  if (!adminKey) {
    return reply
      .status(503)
      .send({ code: "SERVICE_UNAVAILABLE", message: "Backup disabled (admin key not set)" });
  }

  const timestamp = request.headers[WEBHOOK_TIMESTAMP_HEADER];
  const signature = request.headers[WEBHOOK_SIGNATURE_HEADER];
  const valid =
    typeof timestamp === "string" &&
    typeof signature === "string" &&
    typeof request.rawBody === "string" &&
    verifyWebhookSignature({ adminKey, timestamp, rawBody: request.rawBody, signature });
  if (!valid) {
    return reply.status(401).send({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
  }

  const dbPath = sqliteFilePathFromUrl(request.server.env.DATABASE_URL);
  if (!dbPath) {
    return reply
      .status(503)
      .send({ code: "SERVICE_UNAVAILABLE", message: "DATABASE_URL is not a file: SQLite URL" });
  }

  void dbPath; // la fuente la abre Prisma; el path solo valida que es file: SQLite
  const target = join(tmpdir(), `tracker-backup-${randomUUID()}.db`);
  try {
    // VACUUM INTO a través del adapter libsql de Prisma: dump consistente sin
    // abrir un segundo handle. El target es server-generado (uuid en tmpdir);
    // se escapan comillas por si acaso. VACUUM no corre en transacción, así que
    // se ejecuta como statement suelto.
    const escaped = target.replace(/'/g, "''");
    request.server.sqlite.exec(`VACUUM INTO '${escaped}'`);
    const bytes = readFileSync(target);
    request.log.info({ bytes: bytes.byteLength }, "platform backup dump served");
    return reply.header("Content-Type", "application/octet-stream").send(bytes);
  } catch (error) {
    request.log.error({ err: error }, "platform backup VACUUM INTO failed");
    return reply.status(500).send({ code: "BACKUP_FAILED", message: "Could not produce dump" });
  } finally {
    try {
      unlinkSync(target);
    } catch {
      /* ignore */
    }
  }
}
