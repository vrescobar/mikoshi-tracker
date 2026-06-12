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
import { createHash } from "node:crypto";
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
import { Prisma } from "../../generated/prisma/client";
import { addCircleMemberRecord } from "../circles/circle.repository";
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
  const db = request.server.db;

  for (const hint of cohorts) {
    const circle = await db.circle.findUnique({ where: { cohortId: hint.cohortId } });
    if (!circle) continue;

    const existing = await db.circleMembership.findFirst({
      where: { circleId: circle.id, userId },
    });
    try {
      if (!existing) {
        await addCircleMemberRecord(db, { circleId: circle.id, userId, externalId });
      } else if (!existing.externalId) {
        await db.circleMembership.update({
          where: { id: existing.id },
          data: { externalId },
        });
      }
    } catch (enrolError) {
      // Concurrent enrol (unique(circleId, externalId/userId)) — already in.
      if (
        !(
          enrolError instanceof Prisma.PrismaClientKnownRequestError &&
          enrolError.code === "P2002"
        )
      ) {
        throw enrolError;
      }
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
    const db = request.server.db;

    let existing = await db.user.findUnique({
      where: { externalId: input.externalId },
      select: { id: true, name: true },
    });

    // Lazy merge net (story 52): an unknown externalId may be the SURVIVOR of
    // a Mikoshi merge whose orphan we still hold. Sweep our stored ids before
    // creating a fresh row — re-keying beats duplicating the human.
    if (!existing && request.server.mikoshiPlatform) {
      await sweepMergedIdentities(db, request.server.mikoshiPlatform);
      existing = await db.user.findUnique({
        where: { externalId: input.externalId },
        select: { id: true, name: true },
      });
    }

    if (existing) {
      const data: { name?: string; timezone?: string } = {};
      if (
        input.displayName &&
        input.displayName !== input.externalId &&
        existing.name === input.externalId
      ) {
        data.name = input.displayName;
      }
      if (input.timezone) {
        data.timezone = normalizeUserTimeZone(input.timezone);
      }
      if (Object.keys(data).length > 0) {
        await db.user.update({ where: { id: existing.id }, data });
      }

      const { token } = await resetPersonalApiToken(db, existing.id);
      await applyCohortHints(request, existing.id, input.externalId, input.cohorts);
      reply.status(200);
      return { created: false, userId: existing.id, personalToken: token };
    }

    try {
      const user = await db.user.create({
        data: {
          name: input.displayName ?? input.externalId,
          email: syntheticProvisionEmail(input.externalId),
          emailVerified: true,
          timezone: normalizeUserTimeZone(input.timezone),
          externalId: input.externalId,
        },
      });
      const { token } = await resetPersonalApiToken(db, user.id);
      await applyCohortHints(request, user.id, input.externalId, input.cohorts);

      reply.status(201);
      return { created: true, userId: user.id, personalToken: token };
    } catch (createError) {
      // Concurrent provisions: both miss findUnique, second create hits the
      // unique constraint. Resolve idempotently — and still rotate a token so
      // the response keeps the contract's "always a working credential".
      if (
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === "P2002"
      ) {
        const race = await db.user.findUnique({
          where: { externalId: input.externalId },
          select: { id: true },
        });
        if (race) {
          const { token } = await resetPersonalApiToken(db, race.id);
          await applyCohortHints(request, race.id, input.externalId, input.cohorts);
          reply.status(200);
          return { created: false, userId: race.id, personalToken: token };
        }
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
    const db = request.server.db;

    const circle = await db.circle.findUnique({ where: { cohortId: input.cohortId } });
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
    const action = await reconcileMergedIdentity(request.server.db, {
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
