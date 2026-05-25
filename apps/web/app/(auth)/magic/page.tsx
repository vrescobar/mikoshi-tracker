/**
 * Magic-link landing page.
 *
 * The Mikoshi runtime mints URLs like:
 *   https://tracker.example.com/auth/magic?t=<plaintext-token>&next=/food
 *
 * This page is a server component: it exchanges the token for a session
 * cookie via `POST /api/auth/magic-link/consume`, sets the cookie on the
 * outgoing response, and redirects the user to the requested in-app path
 * (default `/dashboard`). Errors render a small error card with a link back
 * to the regular login page.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerApiUrl } from "../../../lib/api";
import { routes } from "../../../lib/navigation";

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

type ErrorPayload = { code: string; message?: string };

const SAFE_DEFAULT_REDIRECT = routes.dashboard;

function reasonFromStatus(status: number, payload: ErrorPayload | null): string {
  if (status === 410) {
    if (payload?.message?.includes("expired")) return "expired";
    return "used";
  }
  if (status === 404) return "invalid";
  if (status >= 500) return "server-error";
  return "invalid";
}

function isSafeNext(next: string | undefined | null): next is string {
  if (typeof next !== "string" || next.length === 0) return false;
  // Only same-origin paths. Block "//host" (scheme-relative) and full URLs.
  return next.startsWith("/") && !next.startsWith("//");
}

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; next?: string }>;
}) {
  const params = await searchParams;
  const token = (params.t ?? "").trim();

  if (!token) {
    return renderError("missing");
  }

  const response = await fetch(createServerApiUrl("/api/auth/magic-link/consume"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ErrorPayload | null = null;
    try {
      payload = (await response.json()) as ErrorPayload;
    } catch {
      payload = null;
    }
    return renderError(reasonFromStatus(response.status, payload));
  }

  const data = (await response.json()) as ConsumeResponse;

  const cookieStore = await cookies();
  cookieStore.set(data.cookie.name, data.cookie.value, {
    httpOnly: data.cookie.httpOnly,
    sameSite: "lax",
    path: data.cookie.path,
    secure: data.cookie.secure,
    maxAge: data.cookie.maxAgeSeconds,
  });

  // Prefer the per-link `next` (set at issuance time) over `?next=` from the
  // URL bar, so a tampered query string can't override what Mikoshi wrote.
  const queryNext = isSafeNext(params.next) ? params.next! : null;
  const linkNext = isSafeNext(data.next) ? data.next : null;
  redirect(linkNext ?? queryNext ?? SAFE_DEFAULT_REDIRECT);
}

function renderError(reason: string) {
  const copy: Record<string, { title: string; body: string }> = {
    missing: {
      title: "Enlace incompleto",
      body: "Te falta el token en la URL. Pide a Mikoshi un nuevo enlace.",
    },
    expired: {
      title: "Enlace expirado",
      body: "Este enlace caducó (15 minutos). Pide a Mikoshi otro enlace.",
    },
    used: {
      title: "Enlace ya usado",
      body: "Este enlace es de un solo uso y ya está consumido. Pide otro.",
    },
    invalid: {
      title: "Enlace inválido",
      body: "No reconocemos ese token. Comprueba que copiaste la URL completa o pide otro a Mikoshi.",
    },
    "server-error": {
      title: "Algo falló en el servidor",
      body: "Vuelve a probar dentro de unos segundos. Si persiste, mira los logs del tracker.",
    },
  };
  const { title, body } = copy[reason] ?? copy.invalid;
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: "1.5rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: ".5rem" }}>{title}</h1>
      <p style={{ marginBottom: "1rem" }}>{body}</p>
      <p>
        <a href="/" style={{ color: "#3a82ff" }}>
          Volver al login
        </a>
      </p>
    </main>
  );
}
