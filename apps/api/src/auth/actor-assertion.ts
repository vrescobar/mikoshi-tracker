import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * AUTH-3 — verificación de la "aserción de actor" firmada por el kernel de
 * Mikoshi. Mueve el control de escritura intra-círculo (un usuario solo escribe
 * como sí mismo, o como owner sobre otros) del runner cliente al SERVIDOR.
 *
 * El kernel firma `${timestamp}.${actorExternalId}.${circleId}` con HMAC-SHA256
 * usando la admin key compartida (la misma de los webhooks). Cabeceras (distintas
 * de las del webhook para no confundir caminos):
 *
 *   X-Mikoshi-Actor:            <actorExternalId>  (== caller.identityId del envelope)
 *   X-Mikoshi-Actor-Timestamp:  <unix ms>
 *   X-Mikoshi-Actor-Signature:  sha256=<hex>
 *
 * El circleId va dentro del material firmado → una aserción capturada no se puede
 * replayear contra otro círculo. Ventana anti-replay de 5 min. Sin secreto nuevo:
 * reusa la admin key (MIKOSHI_TRACKER_ADMIN_API_KEY).
 */
export const ACTOR_HEADER = "x-mikoshi-actor";
export const ACTOR_TIMESTAMP_HEADER = "x-mikoshi-actor-timestamp";
export const ACTOR_SIGNATURE_HEADER = "x-mikoshi-actor-signature";
export const ACTOR_REPLAY_WINDOW_MS = 5 * 60_000;

const SIGNATURE_PREFIX = "sha256=";

export function signActorAssertion(
  adminKey: string,
  timestamp: string,
  actorExternalId: string,
  circleId: string,
): string {
  const hmac = createHmac("sha256", adminKey)
    .update(`${timestamp}.${actorExternalId}.${circleId}`)
    .digest("hex");
  return `${SIGNATURE_PREFIX}${hmac}`;
}

export interface VerifyActorAssertionInput {
  adminKey: string;
  timestamp: string;
  actorExternalId: string;
  circleId: string;
  signature: string;
  /** Inyectable en tests; default Date.now(). */
  nowMs?: number;
  toleranceMs?: number;
}

/** Nunca lanza: cualquier entrada malformada es simplemente inválida. */
export function verifyActorAssertion(input: VerifyActorAssertionInput): boolean {
  const now = input.nowMs ?? Date.now();
  const tolerance = input.toleranceMs ?? ACTOR_REPLAY_WINDOW_MS;

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > tolerance) return false;
  if (!input.actorExternalId || !input.circleId) return false;

  const expected = signActorAssertion(
    input.adminKey,
    input.timestamp,
    input.actorExternalId,
    input.circleId,
  );
  const a = createHmac("sha256", "cmp").update(expected).digest();
  const b = createHmac("sha256", "cmp").update(input.signature).digest();
  return timingSafeEqual(a, b);
}
