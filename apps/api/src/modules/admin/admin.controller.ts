import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

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
import { getUserById, getUserByExternalId } from "../users/user.repository";
import { newId, nowDb } from "../../db/rows";

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

    const existing = getUserByExternalId(request.server.sqlite, input.externalId);

    if (existing) {
      // Self-heal: earlier provisions that ran without a name left `name`
      // equal to the externalId, which surfaces as a raw UUID/LID in the UI
      // (violates the "names always readable" rule). If we now have a real
      // name and the stored one is still just the externalId, backfill it.
      if (input.name && input.name !== input.externalId && existing.name === input.externalId) {
        request.server.sqlite.run(`UPDATE "User" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?`, [
          input.name,
          nowDb(),
          existing.id,
        ]);
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
      const userId = newId();
      const now = nowDb();
      request.server.sqlite.run(
        `INSERT INTO "User" ("id", "name", "email", "emailVerified", "timezone", "externalId", "createdAt", "updatedAt")
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        [userId, name, email, timezone, input.externalId, now, now],
      );

      const { token } = await resetPersonalApiToken(request.server.sqlite, userId);

      reply.status(201);
      return { userId, personalToken: token, alreadyExists: false as const };
    } catch (createError) {
      // Concurrent provision calls: both pass the existence check, second hits a
      // UNIQUE constraint. Re-resolve idempotently as a 200 instead of a 500.
      const race = getUserByExternalId(request.server.sqlite, input.externalId);
      if (race) {
        reply.status(200);
        return { userId: race.id, alreadyExists: true as const };
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

    const user = getUserByExternalId(request.server.sqlite, input.externalId);

    if (!user) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    const { token } = await resetPersonalApiToken(request.server.sqlite, user.id);

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
        db: request.server.sqlite,
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

    // SECURITY (Operación Bikini incident): a magic link is a bearer login
    // credential — whoever opens it gets a session as `externalId`. We must NOT
    // hand the raw URL back to the bot, because the bot relays it into whatever
    // chat it is serving, and in a PUBLIC GROUP any member could click it and
    // hijack this user's account. Instead the tracker delivers the link itself,
    // straight to the requester's own WhatsApp DM (notify by externalId is 1:1,
    // never a group), and returns only `delivered` — same trust-boundary model
    // as the nutrition report. The link still expires (15 min TTL); private
    // delivery is the binding control. The bot cannot leak what it never gets.
    const platform = request.server.mikoshiPlatform;
    if (!platform) {
      return await reply.status(503).send({
        code: "PLATFORM_UNAVAILABLE",
        message:
          "No puedo entregar el enlace de acceso ahora mismo: la mensajería no está disponible. Reinténtalo en un momento.",
      });
    }

    // The platform notify delivers text VERBATIM (raw mode) to the DM — no LLM
    // reformats it — so `prompt` is the exact message the user receives. Keep it
    // to the user-facing line only; the URL must arrive intact and un-shortened.
    const delivered = await platform.notifyText({
      externalId: input.externalId,
      prompt: `🔐 Tu enlace de acceso a MikoshiTracker (válido 15 min, ábrelo solo tú):\n${issued.url}`,
    });
    if (!delivered) {
      return await reply.status(502).send({
        code: "DELIVERY_FAILED",
        message:
          "No pude enviarte el enlace de acceso por privado. Reinténtalo en un momento.",
      });
    }

    reply.status(201);
    return { delivered: true, expiresAt: issued.expiresAt.toISOString() };
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
      db: request.server.sqlite,
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
      db: request.server.sqlite,
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

/**
 * DELETE /api/admin/users/:userId
 *
 * Permanently delete a user account and all its associated data. The database
 * handles cascade removal (Entry, CircleMembership, Session, ApiToken, etc.)
 * via foreign-key rules; this handler only removes the User row after verifying
 * existence.
 */
export async function deleteUserHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { userId } = request.params as { userId: string };

    const user = getUserById(request.server.sqlite, userId);
    if (!user) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No user with that id",
      });
    }

    request.server.sqlite.run(`DELETE FROM "User" WHERE "id" = ?`, [userId]);

    return reply.status(204).send();
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

// ─── Admin circle lifecycle (contest management) ────────────────────────────

export async function createCircleAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const input = createCircleInputSchema.parse(request.body);

    const owner = await findUserByExternalId(request.server.sqlite, input.ownerExternalId);
    if (!owner) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found for ownerExternalId — provision the owner first",
      });
    }

    const circle = await createCircleWithLifecycle(request.server.sqlite, {
      ownerId: owner.id,
      name: input.name,
      season: input.season ?? null,
      contestStartAt: input.contestStartAt ? new Date(input.contestStartAt) : null,
      contestEndAt: input.contestEndAt ? new Date(input.contestEndAt) : null,
    });

    // Mint a read-only circle token so the caller (mikoshi) can store the
    // chat-scope binding in one round-trip. Returned once, never re-readable.
    const { token } = await createCircleToken(request.server.sqlite, circle.id, "mikoshi-binding");
    const memberCount = await countCircleMembers(request.server.sqlite, circle.id);

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

    const existing = await findCircleRecord(request.server.sqlite, circleId);
    if (!existing) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const updated = await updateCircleLifecycle(request.server.sqlite, circleId, {
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
    const memberCount = await countCircleMembers(request.server.sqlite, circleId);

    return { circle: serializeAdminCircle(updated, memberCount) };
  } catch (error) {
    return sendAdminError(reply, error);
  }
}

export async function getCircleAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAdminKey(request);
    const { circleId } = request.params as { circleId: string };
    const circle = await findCircleRecord(request.server.sqlite, circleId);
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }
    const memberCount = await countCircleMembers(request.server.sqlite, circleId);
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

    const circle = await findCircleRecord(request.server.sqlite, circleId);
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const added: string[] = [];
    const alreadyMembers: string[] = [];
    const notProvisioned: string[] = [];

    // De-dup input while preserving order.
    for (const externalId of [...new Set(input.externalIds)]) {
      const user = await findUserByExternalId(request.server.sqlite, externalId);
      if (!user) {
        notProvisioned.push(externalId);
        continue;
      }
      const existing = await findCircleMembershipByUserId(request.server.sqlite, {
        circleId,
        userId: user.id,
      });
      if (existing) {
        alreadyMembers.push(externalId);
        continue;
      }
      try {
        await addCircleMemberRecord(request.server.sqlite, {
          circleId,
          userId: user.id,
          externalId,
        });
        added.push(externalId);
      } catch {
        // Concurrent enrol race (UNIQUE constraint) — treat as already-member.
        alreadyMembers.push(externalId);
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

    const circle = await findCircleRecord(request.server.sqlite, circleId);
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const user = await findUserByExternalId(request.server.sqlite, input.externalId);
    if (!user) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    // Verify membership up front so we never create an orphan habit for a
    // non-member (shareHabit also checks, but only after the habit exists).
    const membership = await findCircleMembershipByUserId(request.server.sqlite, {
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
        { db: request.server.sqlite },
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
      await shareHabit({ db: request.server.sqlite }, { circleId, callerId: user.id, habitId });
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

    const circle = await findCircleRecord(request.server.sqlite, circleId);
    if (!circle) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Circle not found" });
    }

    const user = await findUserByExternalId(request.server.sqlite, input.externalId);
    if (!user) {
      return await reply.status(404).send({
        code: "NOT_FOUND",
        message: "No provisioned user found with that externalId",
      });
    }

    const existing = await findCircleMembershipByUserId(request.server.sqlite, {
      circleId,
      userId: user.id,
    });
    if (existing) {
      reply.status(200);
      return { membershipId: existing.id, userId: existing.userId, externalId: input.externalId };
    }

    try {
      const membership = await addCircleMemberRecord(request.server.sqlite, {
        circleId,
        userId: user.id,
        externalId: input.externalId,
      });
      reply.status(201);
      return { membershipId: membership.id, userId: membership.userId, externalId: input.externalId };
    } catch (createError) {
      // Concurrent enrol calls: both pass findCircleMembershipByUserId, second
      // hits the UNIQUE constraint. Re-resolve idempotently.
      const race = await findCircleMembershipByUserId(request.server.sqlite, {
        circleId,
        userId: user.id,
      });
      if (race) {
        reply.status(200);
        return { membershipId: race.id, userId: race.userId, externalId: input.externalId };
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
    const result = await mergeUsers(request.server.sqlite, input);
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

    const user = getUserById(request.server.sqlite, input.userId);
    if (!user) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "No user with that id" });
    }
    if (user.externalId && user.externalId !== input.externalId && !input.force) {
      return await reply.status(409).send({
        code: "CONFLICT",
        message: `User already has externalId "${user.externalId}". Pass force:true to overwrite.`,
      });
    }

    const conflict = getUserByExternalId(request.server.sqlite, input.externalId);
    if (conflict && conflict.id !== input.userId) {
      return await reply.status(409).send({
        code: "CONFLICT",
        message: `externalId "${input.externalId}" is already attached to another user`,
      });
    }
    request.server.sqlite.run(`UPDATE "User" SET "externalId" = ?, "updatedAt" = ? WHERE "id" = ?`, [
      input.externalId,
      nowDb(),
      input.userId,
    ]);

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
        db: request.server.sqlite,
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
