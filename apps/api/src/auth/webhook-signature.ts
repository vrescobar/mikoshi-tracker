import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifier of Mikoshi platform→extension webhooks — port of the reference
 * implementation in `mikoshi/src/extensions/webhookSignature.ts` (story 18).
 * Keep byte-compatible with it: HMAC-SHA256 with the shared admin key over
 * `${timestamp}.${rawBody}`, headers:
 *
 *   X-Mikoshi-Timestamp: <unix ms>
 *   X-Mikoshi-Signature: sha256=<hex>
 *
 * The timestamp is part of the signed material, so moving it to dodge the
 * 5-min anti-replay window breaks the signature. Verification must run over
 * the RAW request body byte-for-byte, never a re-serialized object.
 */

export const WEBHOOK_TIMESTAMP_HEADER = "x-mikoshi-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "x-mikoshi-signature";
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

const SIGNATURE_PREFIX = "sha256=";

export function signWebhookPayload(adminKey: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac("sha256", adminKey).update(`${timestamp}.${rawBody}`).digest("hex");
  return `${SIGNATURE_PREFIX}${hmac}`;
}

export interface VerifyWebhookSignatureInput {
  adminKey: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  /** Injectable in tests; default Date.now(). */
  nowMs?: number;
  toleranceMs?: number;
}

/** Never throws: any malformed input is simply invalid. */
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
  const now = input.nowMs ?? Date.now();
  const tolerance = input.toleranceMs ?? WEBHOOK_REPLAY_WINDOW_MS;

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > tolerance) return false;

  const expected = signWebhookPayload(input.adminKey, input.timestamp, input.rawBody);
  // Constant-time compare over equal-length digests: we compare HMACs of the
  // two strings, not the strings themselves.
  const a = createHmac("sha256", "cmp").update(expected).digest();
  const b = createHmac("sha256", "cmp").update(input.signature).digest();
  return timingSafeEqual(a, b);
}
