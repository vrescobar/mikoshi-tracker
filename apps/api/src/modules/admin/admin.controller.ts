import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Prisma } from "../../generated/prisma/client";
import { AdminKeyError, requireAdminKey } from "../../auth/admin-key";
import { resetPersonalApiToken } from "../../auth/api-token";
import {
  consumeMagicLink,
  issueMagicLink,
  issueMagicLinkForUserId,
} from "../../auth/magic-link";
import { mergeUsers, UserMergeError } from "./user-merge";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { createHabit } from "../habits/habit.service";
import {
  CircleHabitAlreadySharedError,
  CircleHabitNotFoundError,
  shareHabit,
} from "../circles/circle.service";
import {
  adminLoginAsInputSchema,
  assignHabitInputSchema,
  attachExternalIdInputSchema,
  bulkEnrollInputSchema,
  consumeMagicLinkInputSchema,
  createCircleInputSchema,
  enrollMemberInputSchema,
  issueMagicLinkInputSchema,
  mergeUsersInputSchema,
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

export function sendAdminError(reply: FastifyReply, error: unknown) {
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
      select: { id: true, name: true },
    });

    if (existing) {
      // Self-heal: earlier provisions that ran without a name left `name`
      // equal to the externalId, which surfaces as a raw UUID/LID in the UI
      // (violates the "names always readable" rule). If we now have a real
      // name and the stored one is still just the externalId, backfill it.
      if (input.name && input.name !== input.externalId && existing.name === input.externalId) {
        await request.server.db.user.update({
          where: { id: existing.id },
          data: { name: input.name },
        });
      }
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

const MAGIC_SAFE_DEFAULT = "/";

/**
 * Same-origin relative path guard for the post-login redirect. Blocks
 * protocol-relative `//host` (browsers treat it as a scheme-relative URL)
 * and full URLs — only same-origin paths are accepted.
 */
function isSafeNextPath(p: string | undefined | null): p is string {
  if (typeof p !== "string" || p.length === 0) return false;
  return p.startsWith("/") && !p.startsWith("//");
}

/**
 * GET /magic?t=<token>&next=/path
 *
 * Magic-link landing route: consumes the token and 303-redirects into the app
 * with the session cookie set. This URL shape is a contract with the Mikoshi
 * WhatsApp bot — issued links (`{base}/magic?t=...`) live in chat history, so
 * the path and query parameters must remain stable.
 *
 * Why a RELATIVE Location:
 *   Behind the Caddy reverse proxy the API listens on an internal bind
 *   address, so building an absolute redirect from the request would leak an
 *   unreachable origin. A relative `Location` (e.g. `/`) is resolved by the
 *   browser against the public origin in its address bar, with no dependence
 *   on forwarded headers or env vars. `next` is always a validated
 *   same-origin path (starts with "/", never "//").
 *
 * Security:
 *   - The token is the credential — single-use, hashed in DB, never logged.
 *   - Cookie attributes come straight from signSessionCookieValue so the
 *     surface area for cookie mis-config stays in ONE place
 *     (apps/api/src/auth/magic-link.ts).
 *   - `next` precedence: per-link `next` (set at issuance) > `?next=` query
 *     (could be tampered after the URL is in flight) > safe default `/`.
 */
export async function magicLinkRedirectHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { t?: string; next?: string };
  const redirect = (path: string) => reply.status(303).header("location", path).send();
  const errorRedirect = (reason: string) =>
    redirect(`/?magicError=${encodeURIComponent(reason)}`);

  const token = query.t?.trim() ?? "";
  if (!token) {
    return errorRedirect("missing");
  }

  try {
    const result = await consumeMagicLink({
      db: request.server.db,
      token,
      secret: request.server.env.BETTER_AUTH_SECRET,
      secureCookies: request.server.env.BETTER_AUTH_URL.startsWith("https://"),
    });

    if (!result.ok) {
      return await errorRedirect(result.reason === "not-found" ? "invalid" : result.reason);
    }

    const linkNext = isSafeNextPath(result.next) ? result.next : null;
    const queryNext = isSafeNextPath(query.next) ? query.next : null;
    const destination = linkNext ?? queryNext ?? MAGIC_SAFE_DEFAULT;

    // attrs.httpOnly is the literal `true` in SignedSessionCookie.
    const attrs = result.cookie.attributes;
    const cookie =
      `${result.cookie.name}=${result.cookie.value}` +
      `; Max-Age=${attrs.maxAgeSeconds}; Path=${attrs.path}; SameSite=${attrs.sameSite}` +
      `; HttpOnly${attrs.secure ? "; Secure" : ""}`;
    reply.header("set-cookie", cookie);
    return await redirect(destination);
  } catch (error) {
    request.log.error(error, "magic-link redirect failed");
    return errorRedirect("server-error");
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

/**
 * Assign a habit to a circle member on the operator's behalf (admin key).
 *
 * Two modes (exactly one of `habit` / `habitId` in the body):
 *  - `habit`:   create a new habit as the user, then share it into the circle.
 *  - `habitId`: share an existing habit (owned by the user) into the circle.
 *
 * Reuses the same business logic as the user-facing flow (`createHabit` +
 * `shareHabit`), so validation, config serialization and ownership checks are
 * identical. The share step is idempotent: a pre-existing link returns
 * `alreadyShared: true` instead of erroring.
 */
export async function assignHabitAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const input = assignHabitInputSchema.parse(request.body);

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

    // Verify membership up front so we never create an orphan habit for a
    // non-member (shareHabit also checks, but only after the habit exists).
    const membership = await findCircleMembershipByUserId(request.server.db, {
      circleId,
      userId: user.id,
    });
    if (!membership) {
      return await reply.status(400).send({
        code: "NOT_A_MEMBER",
        message: "User is not a member of this circle — enrol them first",
      });
    }

    // Resolve the habit: create a new one as the user, or use the supplied id.
    let habitId: string;
    let created: boolean;
    if (input.habit) {
      const item = await createHabit(
        { db: request.server.db },
        { userId: user.id, input: input.habit },
      );
      habitId = item.id;
      created = true;
    } else {
      habitId = input.habitId!;
      created = false;
    }

    // Share into the circle (idempotent on the (circleId, entryId) link).
    let alreadyShared = false;
    try {
      await shareHabit({ db: request.server.db }, { circleId, callerId: user.id, habitId });
    } catch (shareError) {
      if (shareError instanceof CircleHabitAlreadySharedError) {
        alreadyShared = true;
      } else if (shareError instanceof CircleHabitNotFoundError) {
        // Only reachable in habitId mode: the habit doesn't exist or isn't the user's.
        return await reply.status(404).send({
          code: "NOT_FOUND",
          message: "No habit with that id owned by the user",
        });
      } else {
        throw shareError;
      }
    }

    reply.status(created ? 201 : 200);
    return { userId: user.id, habitId, created, shared: true, alreadyShared };
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

/**
 * Merge a duplicate User row (`sourceUserId`) into the canonical one
 * (`targetUserId`): re-parent all data, carry externalId + admin flag, delete
 * the source. Used to consolidate a human's web account + provisioned account.
 */
export async function mergeUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = mergeUsersInputSchema.parse(request.body);
    const result = await mergeUsers(request.server.db, input);
    reply.status(200);
    return result;
  } catch (error) {
    if (error instanceof UserMergeError) {
      const status = error.code === "SAME_USER" ? 400 : 404;
      return await reply.status(status).send({
        code: error.code === "SAME_USER" ? "BAD_REQUEST" : "NOT_FOUND",
        message: error.message,
      });
    }
    return sendAdminError(reply, error);
  }
}

/**
 * Attach a Mikoshi `externalId` (WhatsApp identity) to an existing user so the
 * magic-link + skill token resolve to that account — instead of provisioning
 * spawning a second synthetic-email row. Rejects if the user already has an
 * externalId (unless `force`) or the externalId is taken by another user.
 */
export async function attachExternalIdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = attachExternalIdInputSchema.parse(request.body);

    const user = await request.server.db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, externalId: true },
    });
    if (!user) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "No user with that id" });
    }
    if (user.externalId && user.externalId !== input.externalId && !input.force) {
      return await reply.status(409).send({
        code: "CONFLICT",
        message: `User already has externalId "${user.externalId}". Pass force:true to overwrite.`,
      });
    }

    try {
      await request.server.db.user.update({
        where: { id: input.userId },
        data: { externalId: input.externalId },
      });
    } catch (updateError) {
      if (
        updateError instanceof Prisma.PrismaClientKnownRequestError &&
        updateError.code === "P2002"
      ) {
        return await reply.status(409).send({
          code: "CONFLICT",
          message: `externalId "${input.externalId}" is already attached to another user`,
        });
      }
      throw updateError;
    }

    reply.status(200);
    return {
      userId: input.userId,
      externalId: input.externalId,
      previousExternalId: user.externalId,
    };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

/**
 * God Mode: mint a single-use login link for ANY user by id, so an admin can
 * see/use exactly what that member sees without a second account. Same
 * single-use + TTL guarantees as the externalId magic link.
 */
export async function adminLoginAsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = adminLoginAsInputSchema.parse(request.body);

    const appBaseUrl = request.server.env.BETTER_AUTH_URL;
    let issued;
    try {
      issued = await issueMagicLinkForUserId({
        db: request.server.db,
        appBaseUrl,
        userId: input.userId,
        next: input.next,
      });
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "Invalid next";
      return await reply.status(400).send({ code: "BAD_REQUEST", message });
    }

    if (!issued) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "No user with that id" });
    }

    reply.status(201);
    return { url: issued.url, userId: input.userId, expiresAt: issued.expiresAt.toISOString() };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}
