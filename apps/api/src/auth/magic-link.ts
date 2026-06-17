/**
 * Magic-link login support.
 *
 * Issuance (admin-gated): `POST /api/admin/issue-magic-link`. The Mikoshi
 * runtime mints a single-use URL on behalf of a provisioned user; we store
 * the SHA-256 hash of the plaintext token (same pattern as `ApiToken`) and
 * return the URL with the *plaintext* embedded.
 *
 * Consumption (no admin key, just the token): `POST /api/auth/magic-link/consume`.
 * Hash → lookup row → mark consumed → create a `Session` row → return a
 * signed cookie value compatible with `better-auth`'s `session_token` cookie.
 * The Next.js `/auth/magic` page sets the cookie and redirects.
 *
 * Security invariants:
 *   - Plaintext token never lands in the DB (hash-only storage).
 *   - `consumedAt` records first use; re-consume is allowed only within a grace
 *     window (= TTL) so a link-preview/prefetch GET can't lock the human out.
 *   - TTL gate: expired tokens are rejected (the binding time gate).
 *   - `next` must be a path (starts with "/") — never an external URL — to
 *     prevent open-redirect abuse. Validated both at issuance and at consume.
 *   - Signed cookie format matches better-call's `serializeSignedCookie`
 *     (HMAC-SHA256 over the value, base64-encoded, joined with ".", then
 *     URL-encoded as a whole).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client";

export const MAGIC_LINK_DEFAULT_TTL_SECONDS = 15 * 60; // 15 min
/**
 * How long after first use a magic-link token may still be re-consumed.
 *
 * A strictly single-use token is routinely burned by a link-preview bot or a
 * browser/OS prefetch that GETs the URL *before* the human taps it — which
 * surfaces as "magicLink used" on the real click. This is especially likely
 * when the link host is a directly-reachable IP (e.g. a Tailscale dev box). We
 * therefore let the token be consumed repeatedly until it EXPIRES: the short
 * TTL is the real time gate, and delivery is private (WhatsApp + Tailscale).
 * Set to the TTL so expiry is the binding constraint.
 */
export const MAGIC_LINK_REUSE_GRACE_SECONDS = MAGIC_LINK_DEFAULT_TTL_SECONDS;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches the better-auth default 7d? No: better-auth defaults to 7d but a tracker session that lives 30d is acceptable; we lean longer because the admin re-issues per device.

const MAGIC_LINK_TOKEN_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;
const COOKIE_NAME = "better-auth.session_token";

export interface IssuedMagicLink {
  url: string;
  expiresAt: Date;
}

/**
 * Issue a one-shot login link for a provisioned user identified by `externalId`.
 *
 * Returns `null` when no user matches the externalId — the caller is
 * responsible for surfacing a 404. The plaintext token is embedded into the
 * URL and intentionally not stored.
 */
export async function issueMagicLink(opts: {
  db: PrismaClient;
  appBaseUrl: string;
  externalId: string;
  next?: string;
  ttlSeconds?: number;
  /** Override for tests so they can pin an exact expiresAt. */
  now?: Date;
}): Promise<IssuedMagicLink | null> {
  const user = await opts.db.user.findUnique({
    where: { externalId: opts.externalId },
    select: { id: true },
  });
  if (!user) return null;

  validateNextPath(opts.next);

  const plaintext = randomBytes(MAGIC_LINK_TOKEN_BYTES).toString("hex");
  const tokenHash = hashMagicLinkToken(plaintext);
  const now = opts.now ?? new Date();
  const ttl = (opts.ttlSeconds ?? MAGIC_LINK_DEFAULT_TTL_SECONDS) * 1000;
  const expiresAt = new Date(now.getTime() + ttl);

  await opts.db.magicLink.create({
    data: {
      userId: user.id,
      token: tokenHash,
      expiresAt,
      next: opts.next ?? null,
      createdAt: now,
    },
  });

  const base = trimTrailingSlash(opts.appBaseUrl);
  // Next.js route-group convention: `app/(auth)/magic/page.tsx` resolves to
  // `/magic` (the `(auth)` parentheses are stripped from the URL — they group
  // routes under a shared layout but do not become a path segment).
  const url = `${base}/magic?t=${encodeURIComponent(plaintext)}`;
  return { url, expiresAt };
}

/**
 * Issue a one-shot login link for an arbitrary user identified by `userId`
 * (NOT externalId). This powers admin "log in as / view as" (God Mode): an
 * admin mints a single-use URL that, when opened, starts a session as that
 * user — the clean way to see exactly what a member sees without a second
 * account. Same single-use + TTL + hash-only storage guarantees as the
 * externalId variant. Returns null when the user does not exist.
 */
export async function issueMagicLinkForUserId(opts: {
  db: PrismaClient;
  appBaseUrl: string;
  userId: string;
  next?: string;
  ttlSeconds?: number;
  now?: Date;
}): Promise<IssuedMagicLink | null> {
  const user = await opts.db.user.findUnique({
    where: { id: opts.userId },
    select: { id: true },
  });
  if (!user) return null;

  validateNextPath(opts.next);

  const plaintext = randomBytes(MAGIC_LINK_TOKEN_BYTES).toString("hex");
  const tokenHash = hashMagicLinkToken(plaintext);
  const now = opts.now ?? new Date();
  const ttl = (opts.ttlSeconds ?? MAGIC_LINK_DEFAULT_TTL_SECONDS) * 1000;
  const expiresAt = new Date(now.getTime() + ttl);

  await opts.db.magicLink.create({
    data: {
      userId: user.id,
      token: tokenHash,
      expiresAt,
      next: opts.next ?? null,
      createdAt: now,
    },
  });

  const base = trimTrailingSlash(opts.appBaseUrl);
  const url = `${base}/magic?t=${encodeURIComponent(plaintext)}`;
  return { url, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string; cookie: SignedSessionCookie; next: string | null }
  | { ok: false; reason: "not-found" | "expired" | "used" };

export interface SignedSessionCookie {
  name: string;
  value: string;
  attributes: {
    httpOnly: true;
    sameSite: "Lax";
    path: "/";
    secure: boolean;
    maxAgeSeconds: number;
  };
}

/**
 * Consume a magic-link token: validate, mark single-use, create a Session row
 * and return the signed cookie payload the web page must set on the response.
 *
 * `secret` is the better-auth secret — same value passed to `betterAuth({secret})`.
 * `secureCookies` should be `true` in production (HTTPS); the cookie attribute
 * is independent from the URL scheme of the API itself.
 */
export async function consumeMagicLink(opts: {
  db: PrismaClient;
  token: string;
  secret: string;
  secureCookies: boolean;
  now?: Date;
}): Promise<ConsumeResult> {
  const now = opts.now ?? new Date();
  const tokenHash = hashMagicLinkToken(opts.token);

  const row = await opts.db.magicLink.findUnique({
    where: { token: tokenHash },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  // Prefetch/link-preview tolerance: a preview bot or browser prefetch often
  // GETs the URL and stamps `consumedAt` before the human taps it. Rather than
  // reject every subsequent GET as "used", allow re-consume within a grace
  // window (= the TTL, so a still-valid link always works). `consumedAt` keeps
  // its first-use timestamp; only a re-consume past the grace window is "used".
  if (row.consumedAt) {
    const sinceConsumedMs = now.getTime() - row.consumedAt.getTime();
    if (sinceConsumedMs > MAGIC_LINK_REUSE_GRACE_SECONDS * 1000) {
      return { ok: false, reason: "used" };
    }
    // within grace → fall through and mint a fresh session for this request
  } else {
    // First use: stamp consumedAt. A concurrent prefetch losing/winning the CAS
    // is fine — either way we mint a session for the request in hand.
    await opts.db.magicLink.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  // Issue the session token verbatim into Session.token (better-auth doesn't
  // hash session tokens — the row IS the bearer).
  const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await opts.db.session.create({
    data: {
      userId: row.userId,
      token: sessionToken,
      expiresAt: sessionExpiresAt,
      ipAddress: "",
      userAgent: "magic-link",
      createdAt: now,
      updatedAt: now,
    },
  });

  const signed = await signSessionCookieValue(sessionToken, opts.secret);
  return {
    ok: true,
    userId: row.userId,
    cookie: {
      name: COOKIE_NAME,
      value: signed,
      attributes: {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        secure: opts.secureCookies,
        maxAgeSeconds: SESSION_TTL_SECONDS,
      },
    },
    next: row.next,
  };
}

// ─── helpers (exported for tests) ───────────────────────────────────────────

export function hashMagicLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mirror of better-call's `signCookieValue`:
 *   - HMAC-SHA256(secret, value) → base64
 *   - "${value}.${b64sig}"
 *   - URL-encoded as a whole
 *
 * Source: node_modules/better-call/dist/crypto.mjs
 */
export async function signSessionCookieValue(value: string, secret: string): Promise<string> {
  const sig = createHmac("sha256", secret).update(value).digest("base64");
  return encodeURIComponent(`${value}.${sig}`);
}

/**
 * Reject obvious open-redirect attempts at issuance time. Accepts only same-
 * origin relative paths starting with "/" and forbids "//host" double-slash
 * which browsers treat as a scheme-relative URL.
 */
export function validateNextPath(next: string | undefined): void {
  if (next === undefined) return;
  if (typeof next !== "string" || next.length === 0) {
    throw new Error("next must be a non-empty string");
  }
  if (!next.startsWith("/")) {
    throw new Error("next must start with '/'");
  }
  if (next.startsWith("//")) {
    throw new Error("next must be a single-slash path");
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
