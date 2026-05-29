/**
 * GET /magic?t=<token>&next=/path
 *
 * Magic-link landing route. Exchanges the token for a session cookie via
 * `POST /api/auth/magic-link/consume` and 303-redirects the user into the app.
 *
 * Why a Route Handler instead of a Server Component page:
 *   Next.js 15+ refuses `cookies().set()` from a Server Component (it can
 *   only be called from a Server Action or Route Handler). We need to set
 *   the session cookie on the *outgoing* response, so a Route Handler is
 *   the natural fit. It also lets us return a real 3xx instead of a
 *   client-side soft redirect, which is what email clients and OS-level
 *   handoff expect from a "magic link".
 *
 * Why a RELATIVE Location:
 *   Behind the Caddy reverse proxy the app listens on the internal bind
 *   address `0.0.0.0:3000`, and `req.url` resolves to that internal origin —
 *   so building the redirect with `new URL(path, req.url)` produced
 *   `http://0.0.0.0:3000/`, which is unreachable from the user's browser.
 *   A relative `Location` (e.g. `/`) is resolved by the browser against the
 *   public origin in its address bar (`http://jetson:7080`), with no
 *   dependence on forwarded headers or env vars. `next` is always a validated
 *   same-origin path (starts with "/", never "//"), so it is safe to emit
 *   verbatim as a relative redirect target.
 *
 * Security:
 *   - The token is the credential — single-use, hashed in DB, never logged.
 *   - The cookie is `better-auth.session_token` with HttpOnly + Secure
 *     (when behind HTTPS) + SameSite=Lax. Attributes come straight from
 *     the API response so the surface area for cookie mis-config is in
 *     ONE place (apps/api/src/auth/magic-link.ts:signSessionCookieValue).
 *   - `next` precedence: per-link `next` (set at issuance) > `?next=` query
 *     (could be tampered after the URL is in flight) > safe default `/`.
 *     Both are filtered through `isSafePath` to block open-redirect attacks.
 */
import { NextResponse, type NextRequest } from "next/server";

import { createServerApiUrl } from "../../lib/api";

const SAFE_DEFAULT = "/";

type ConsumeResponse = {
  userId: string;
  next: string;
  cookie: {
    name: string;
    value: string;
    httpOnly: boolean;
    sameSite: "Lax";
    path: string;
    secure: boolean;
    maxAgeSeconds: number;
  };
};

function isSafePath(p: string | undefined | null): p is string {
  if (typeof p !== "string" || p.length === 0) return false;
  // Block protocol-relative `//host` (browsers treat as scheme-relative URL)
  // and full URLs. Only same-origin paths are accepted.
  return p.startsWith("/") && !p.startsWith("//");
}

/**
 * 303 redirect to a same-origin relative path. The browser resolves the
 * relative `Location` against the public origin it requested, not the app's
 * internal bind address.
 */
function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

function errorRedirect(reason: string): NextResponse {
  return relativeRedirect(`/?magicError=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("t")?.trim() ?? "";
  if (!token) {
    return errorRedirect("missing");
  }

  const response = await fetch(createServerApiUrl("/api/auth/magic-link/consume"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!response.ok) {
    let payloadMessage: string | undefined;
    try {
      const payload = (await response.json()) as { message?: string };
      payloadMessage = payload.message;
    } catch {
      // ignore
    }
    if (response.status === 410) {
      return errorRedirect(payloadMessage?.includes("expired") ? "expired" : "used");
    }
    if (response.status === 404) {
      return errorRedirect("invalid");
    }
    return errorRedirect("server-error");
  }

  const data = (await response.json()) as ConsumeResponse;

  const queryNext = req.nextUrl.searchParams.get("next");
  const linkNext = isSafePath(data.next) ? data.next : null;
  const safeQueryNext = isSafePath(queryNext) ? queryNext : null;
  const destination = linkNext ?? safeQueryNext ?? SAFE_DEFAULT;

  const out = relativeRedirect(destination);
  out.cookies.set({
    name: data.cookie.name,
    value: data.cookie.value,
    httpOnly: data.cookie.httpOnly,
    sameSite: "lax",
    path: data.cookie.path,
    secure: data.cookie.secure,
    maxAge: data.cookie.maxAgeSeconds,
  });
  return out;
}
