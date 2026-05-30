import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Prisma } from "../../generated/prisma/client";
import { AdminKeyError, requireAdminKey } from "../../auth/admin-key";
import { resetPersonalApiToken } from "../../auth/api-token";
import {
  consumeMagicLink,
  issueMagicLink,
} from "../../auth/magic-link";
import { normalizeUserTimeZone } from "../../shared/timezone";
import {
  bulkEnrollInputSchema,
  consumeMagicLinkInputSchema,
  createCircleInputSchema,
  enrollMemberInputSchema,
  issueMagicLinkInputSchema,
  provisionUserInputSchema,
  resetProvisionedTokenInputSchema,
  updateCircleInputSchema,
} from "@mikoshi-tracker/contracts/admin";
import { createCircleToken } from "../../auth/circle-token";
import {
  addCircleMemberRecord,
  countCircleMembers,
  createCircleWithLifecycle,
  findCircleMembershipByUserId,
  findCircleRecord,
  findUserByExternalId,
  updateCircleLifecycle,
} from "../circles/circle.repository";

/** Serialize a circle record (+ member count) into the admin contract shape. */
function serializeAdminCircle(
  circle: {
    id: string;
    name: string;
    ownerId: string;
    status: string;
    season: string | null;
    contestStartAt: Date | null;
    contestEndAt: Date | null;
    leaderboardMode: string;
    createdAt: Date;
    updatedAt: Date;
  },
  memberCount: number,
) {
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.ownerId,
    status: circle.status,
    season: circle.season,
    contestStartAt: circle.contestStartAt ? circle.contestStartAt.toISOString() : null,
    contestEndAt: circle.contestEndAt ? circle.contestEndAt.toISOString() : null,
    leaderboardMode: circle.leaderboardMode,
    memberCount,
    createdAt: circle.createdAt.toISOString(),
    updatedAt: circle.updatedAt.toISOString(),
  };
}

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
    const email = `provisioned-${emailHash}@mikoshi-tracker.internal`;
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
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    const { token } = await resetPersonalApiToken(request.server.db, user.id);

    return { userId: user.id, personalToken: token };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

// ─── Magic-link issuance + consumption ─────────────────────────────────────

export async function issueMagicLinkHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await requireAdminKey(request);
    const input = issueMagicLinkInputSchema.parse(request.body);

    const appBaseUrl = request.server.env.BETTER_AUTH_URL;
    let issued;
    try {
      issued = await issueMagicLink({
        db: request.server.db,
        appBaseUrl,
        externalId: input.externalId,
        next: input.next,
      });
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : "Invalid next";
      return await reply.status(400).send({
        code: "BAD_REQUEST",
        message,
      });
    }

    if (!issued) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    reply.status(201);
    return { url: issued.url, expiresAt: issued.expiresAt.toISOString() };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function consumeMagicLinkHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const input = consumeMagicLinkInputSchema.parse(request.body);

    const result = await consumeMagicLink({
      db: request.server.db,
      token: input.token,
      secret: request.server.env.BETTER_AUTH_SECRET,
      // Mirror better-auth's secure-cookie default: HTTPS base URL → secure.
      secureCookies: request.server.env.BETTER_AUTH_URL.startsWith("https://"),
    });

    if (!result.ok) {
      // 410 Gone for used/expired, 404 for not-found — keeps "URL still works"
      // distinguishable from "URL was a typo" in the page UI.
      const status = result.reason === "not-found" ? 404 : 410;
      const code = result.reason === "not-found" ? "NOT_FOUND" : "GONE";
      return await reply.status(status).send({
        code,
        message: `Magic link ${result.reason}`,
      });
    }

    return {
      userId: result.userId,
      next: result.next ?? "",
      cookie: {
        name: result.cookie.name,
        value: result.cookie.value,
        httpOnly: result.cookie.attributes.httpOnly,
        sameSite: result.cookie.attributes.sameSite,
        path: result.cookie.attributes.path,
        secure: result.cookie.attributes.secure,
        maxAgeSeconds: result.cookie.attributes.maxAgeSeconds,
      },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      reply.status(400);
      return {
        code: "BAD_REQUEST",
        message: "Invalid request payload",
        issues: error.flatten(),
      };
    }
    throw error;
  }
}

// ─── Admin circle lifecycle (contest management) ────────────────────────────

export async function createCircleAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = createCircleInputSchema.parse(request.body);

    const owner = await findUserByExternalId(request.server.db, input.ownerExternalId);
    if (!owner) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found for ownerExternalId — provision the owner first",
      });
    }

    const circle = await createCircleWithLifecycle(request.server.db, {
      ownerId: owner.id,
      name: input.name,
      season: input.season ?? null,
      contestStartAt: input.contestStartAt ? new Date(input.contestStartAt) : null,
      contestEndAt: input.contestEndAt ? new Date(input.contestEndAt) : null,
    });

    // Mint a read-only circle token so the caller (mikoshi) can store the
    // chat-scope binding in one round-trip. Returned once, never re-readable.
    const { token } = await createCircleToken(request.server.db, circle.id, "mikoshi-binding");
    const memberCount = await countCircleMembers(request.server.db, circle.id);

    reply.status(201);
    return { circle: serializeAdminCircle(circle, memberCount), circleToken: token };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function updateCircleAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const input = updateCircleInputSchema.parse(request.body);

    const existing = await findCircleRecord(request.server.db, circleId);
    if (!existing) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const updated = await updateCircleLifecycle(request.server.db, circleId, {
      status: input.status,
      season: input.season,
      contestStartAt:
        input.contestStartAt === undefined
          ? undefined
          : input.contestStartAt === null
            ? null
            : new Date(input.contestStartAt),
      contestEndAt:
        input.contestEndAt === undefined
          ? undefined
          : input.contestEndAt === null
            ? null
            : new Date(input.contestEndAt),
      leaderboardMode: input.leaderboardMode,
    });
    const memberCount = await countCircleMembers(request.server.db, circleId);

    return { circle: serializeAdminCircle(updated, memberCount) };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function getCircleAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const circle = await findCircleRecord(request.server.db, circleId);
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }
    const memberCount = await countCircleMembers(request.server.db, circleId);
    return { circle: serializeAdminCircle(circle, memberCount) };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function bulkEnrollAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const input = bulkEnrollInputSchema.parse(request.body);

    const circle = await request.server.db.circle.findUnique({
      where: { id: circleId },
      select: { id: true },
    });
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const added: string[] = [];
    const alreadyMembers: string[] = [];
    const notProvisioned: string[] = [];

    // De-dup input while preserving order.
    for (const externalId of [...new Set(input.externalIds)]) {
      const user = await findUserByExternalId(request.server.db, externalId);
      if (!user) {
        notProvisioned.push(externalId);
        continue;
      }
      const existing = await findCircleMembershipByUserId(request.server.db, {
        circleId,
        userId: user.id,
      });
      if (existing) {
        alreadyMembers.push(externalId);
        continue;
      }
      try {
        await addCircleMemberRecord(request.server.db, {
          circleId,
          userId: user.id,
          externalId,
        });
        added.push(externalId);
      } catch (createError) {
        // Concurrent enrol race — treat as already-member.
        if (
          createError instanceof Prisma.PrismaClientKnownRequestError &&
          createError.code === "P2002"
        ) {
          alreadyMembers.push(externalId);
        } else {
          throw createError;
        }
      }
    }

    return { added, alreadyMembers, notProvisioned };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function enrollMemberByExternalIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const input = enrollMemberInputSchema.parse(request.body);

    const circle = await request.server.db.circle.findUnique({
      where: { id: circleId },
      select: { id: true },
    });
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const user = await findUserByExternalId(request.server.db, input.externalId);
    if (!user) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    const existing = await findCircleMembershipByUserId(request.server.db, {
      circleId,
      userId: user.id,
    });
    if (existing) {
      reply.status(200);
      return { membershipId: existing.id, userId: existing.userId, externalId: input.externalId };
    }

    try {
      const membership = await addCircleMemberRecord(request.server.db, {
        circleId,
        userId: user.id,
        externalId: input.externalId,
      });
      reply.status(201);
      return { membershipId: membership.id, userId: membership.userId, externalId: input.externalId };
    } catch (createError) {
      // Concurrent enrol calls: both pass findCircleMembershipByUserId, second hits unique constraint.
      if (
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === "P2002"
      ) {
        const race = await findCircleMembershipByUserId(request.server.db, {
          circleId,
          userId: user.id,
        });
        if (race) {
          reply.status(200);
          return { membershipId: race.id, userId: race.userId, externalId: input.externalId };
        }
      }
      throw createError;
    }
  } catch (error) {
    return sendAdminError(reply, error);
  }
}
