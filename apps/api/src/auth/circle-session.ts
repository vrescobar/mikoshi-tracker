import type { FastifyRequest } from "fastify";

import { findCircleByToken } from "./circle-token";
import {
  ACTOR_HEADER,
  ACTOR_SIGNATURE_HEADER,
  ACTOR_TIMESTAMP_HEADER,
  verifyActorAssertion,
} from "./actor-assertion";

export class CircleAuthError extends Error {
  constructor(
    public readonly statusCode: 401 | 403 | 404,
    message: string,
    /**
     * Código de respuesta explícito. Sin él, el statusCode decide
     * (401→UNAUTHORIZED, else FORBIDDEN). Se usa para distinguir los fallos de
     * ASERCIÓN DE ACTOR (ACTOR_REQUIRED/ACTOR_INVALID) del rechazo del TOKEN del
     * círculo: ambos son 401/403, pero la causa y el arreglo son distintos, y
     * colapsarlos en "token caducado" despista (ver incidente bikini 2026-06-16).
     */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CircleAuthError";
  }
}

export interface CircleContext {
  circle: { id: string; name: string; ownerId: string };
  tokenId: string;
}

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ", 2);

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireCircleContext(
  request: FastifyRequest,
  pathCircleId: string,
): Promise<CircleContext> {
  const bearer = getBearerToken(request);

  if (!bearer) {
    throw new CircleAuthError(401, "Circle token required");
  }

  const result = await findCircleByToken(request.server.sqlite, bearer);

  if (!result) {
    throw new CircleAuthError(401, "Invalid or unknown circle token");
  }

  if (result.circle.id !== pathCircleId) {
    throw new CircleAuthError(403, "Circle token is not valid for this circle");
  }

  return {
    circle: result.circle,
    tokenId: result.tokenId,
  };
}

/** Resultado de resolver la aserción de actor firmada de una request de círculo. */
export type CircleActorResolution =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; actorExternalId: string };

function headerString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * AUTH-3: verifica la aserción de actor firmada (si viene) contra la admin key
 * y el circleId del contexto. NO lanza — devuelve el veredicto para que el
 * controller decida (rollout en 2 fases: Fase A tolera la ausencia, Fase B no).
 *  - absent:  la request no trae cabeceras de actor (camino legacy).
 *  - invalid: trae cabeceras pero la firma/timestamp/círculo no validan (forjada).
 *  - valid:   actor verificado; `actorExternalId` es de confianza server-side.
 */
export function resolveCircleActor(
  request: FastifyRequest,
  context: CircleContext,
  nowMs?: number,
): CircleActorResolution {
  const actor = headerString(request.headers[ACTOR_HEADER]);
  const timestamp = headerString(request.headers[ACTOR_TIMESTAMP_HEADER]);
  const signature = headerString(request.headers[ACTOR_SIGNATURE_HEADER]);

  if (!actor && !timestamp && !signature) return { status: "absent" };
  if (!actor || !timestamp || !signature) return { status: "invalid" };

  const adminKey = process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  if (!adminKey) return { status: "invalid" };

  const ok = verifyActorAssertion({
    adminKey,
    timestamp,
    actorExternalId: actor,
    circleId: context.circle.id,
    signature,
    ...(nowMs !== undefined ? { nowMs } : {}),
  });
  return ok ? { status: "valid", actorExternalId: actor } : { status: "invalid" };
}

/** ¿Está activado el enforcement duro (Fase B)? Por defecto NO (Fase A). */
export function actorEnforcementRequired(): boolean {
  return process.env.MIKOSHI_TRACKER_REQUIRE_ACTOR === "1";
}
