/**
 * Handlers of the extensions-platform contract namespace (story 50):
 * `POST /api/platform/provision` speaking the contract shape of
 * `~/projects/mikoshi-stack/docs/contract-summary.md` (`displayName`,
 * `{created, userId, personalToken}`), gated by the same admin credential
 * resolution as the legacy `/api/admin/*` routes.
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

import { platformProvisionInputSchema } from "@mikoshi-tracker/contracts/platform";

import { requireAdminKey } from "../../auth/admin-key";
import { resetPersonalApiToken } from "../../auth/api-token";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { Prisma } from "../../generated/prisma/client";
import { sendAdminError } from "../admin/admin.controller";

/**
 * Deterministic synthetic email for API-only provisioned users — same
 * derivation as the legacy provision handler so a user provisioned via either
 * namespace gets the same address.
 */
function syntheticProvisionEmail(externalId: string): string {
  const emailHash = createHash("sha256").update(externalId).digest("hex").slice(0, 24);
  return `provisioned-${emailHash}@mikoshi-tracker.internal`;
}

export async function platformProvisionHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = platformProvisionInputSchema.parse(request.body);
    const db = request.server.db;

    const existing = await db.user.findUnique({
      where: { externalId: input.externalId },
      select: { id: true, name: true },
    });

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
