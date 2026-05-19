import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Prisma } from "../../generated/prisma/client";
import { AdminKeyError, requireAdminKey } from "../../auth/admin-key";
import { resetPersonalApiToken } from "../../auth/api-token";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { provisionUserInputSchema, resetProvisionedTokenInputSchema } from "@haaabit/contracts/admin";

function sendAdminError(reply: FastifyReply, error: unknown) {
  if (error instanceof AdminKeyError) {
    if (error.statusCode === 503) {
      reply.status(503).send({
        code: "SERVICE_UNAVAILABLE",
        message: error.message,
      });
    } else {
      reply.status(401).send({
        code: "UNAUTHORIZED",
        message: error.message,
      });
    }
    return reply;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid request payload",
      issues: error.flatten(),
    });
    return reply;
  }

  throw error;
}

export async function provisionUserHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = provisionUserInputSchema.parse(request.body);

    const existing = await request.server.db.user.findUnique({
      where: { externalId: input.externalId },
      select: { id: true },
    });

    if (existing) {
      reply.status(200);
      return { userId: existing.id, alreadyExists: true as const };
    }

    // Derive a deterministic synthetic email from the externalId hash so it is
    // unique and stable but never a real address (API-only user, no password login).
    const emailHash = createHash("sha256").update(input.externalId).digest("hex").slice(0, 24);
    const email = `provisioned-${emailHash}@haaabit.internal`;
    const timezone = normalizeUserTimeZone(input.timezone);
    const name = input.name ?? input.externalId;

    try {
      const user = await request.server.db.user.create({
        data: {
          name,
          email,
          emailVerified: true,
          timezone,
          externalId: input.externalId,
        },
      });

      const { token } = await resetPersonalApiToken(request.server.db, user.id);

      reply.status(201);
      return { userId: user.id, personalToken: token, alreadyExists: false as const };
    } catch (createError) {
      // Concurrent provision calls: both pass findUnique, second hits unique constraint.
      // Re-resolve idempotently as a 200 instead of surfacing a 500.
      if (
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === "P2002"
      ) {
        const race = await request.server.db.user.findUnique({
          where: { externalId: input.externalId },
          select: { id: true },
        });
        if (race) {
          reply.status(200);
          return { userId: race.id, alreadyExists: true as const };
        }
      }
      throw createError;
    }
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function resetProvisionedTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = resetProvisionedTokenInputSchema.parse(request.body);

    const user = await request.server.db.user.findUnique({
      where: { externalId: input.externalId },
      select: { id: true },
    });

    if (!user) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
      return reply;
    }

    const { token } = await resetPersonalApiToken(request.server.db, user.id);

    return { userId: user.id, personalToken: token };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}
