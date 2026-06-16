/**
 * Thin client of the Mikoshi Platform API (`/api/platform/v1` on the private
 * plane). Auth is the per-extension shared secret — the same
 * MIKOSHI_TRACKER_ADMIN_API_KEY Mikoshi uses to call us — read lazily so env
 * changes (tests, reloads) are picked up per call.
 *
 * Every method is best-effort by design: a down/unreachable Mikoshi returns
 * `null` instead of throwing, because roster pulls and identity lookups must
 * never take user-facing flows (magic links, provisioning) down with them.
 */
import type { FastifyInstance } from "fastify";
import {
  signWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../../auth/webhook-signature";

export interface CohortRosterMember {
  externalId: string;
  displayName?: string;
  phone?: string;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export interface MikoshiPlatformClientOptions {
  /** e.g. "http://127.0.0.1:7777/api/platform/v1" (no trailing slash needed). */
  baseUrl: string;
  /** Lazily resolved bearer; undefined → calls are skipped (return null). */
  getAdminKey: () => string | undefined;
  timeoutMs?: number;
}

export class MikoshiPlatformClient {
  private readonly baseUrl: string;
  private readonly getAdminKey: () => string | undefined;
  private readonly timeoutMs: number;

  constructor(options: MikoshiPlatformClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAdminKey = options.getAdminKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** `GET /cohorts/:id/members` → roster, or null when unavailable. */
  async listCohortMembers(cohortId: string): Promise<CohortRosterMember[] | null> {
    const body = await this.get(`/cohorts/${encodeURIComponent(cohortId)}/members`);
    if (!Array.isArray(body)) return null;
    const members: CohortRosterMember[] = [];
    for (const item of body) {
      if (typeof item !== "object" || item === null) continue;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.externalId !== "string" || candidate.externalId.length === 0) continue;
      members.push({
        externalId: candidate.externalId,
        ...(typeof candidate.displayName === "string" ? { displayName: candidate.displayName } : {}),
        ...(typeof candidate.phone === "string" ? { phone: candidate.phone } : {}),
      });
    }
    return members;
  }

  /**
   * `GET /identities/:id` → raw identity payload, or null when unavailable.
   * The interesting shape for us is the merge tombstone
   * `{merged: true, survivorId, identity}` (story 52 consumes it).
   */
  async getIdentity(externalId: string): Promise<Record<string, unknown> | null> {
    const body = await this.get(`/identities/${encodeURIComponent(externalId)}`);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  }

  /**
   * `POST /notify` in image mode — deliver a chart PNG to a user's WhatsApp DM.
   * `imageBase64` is the raw PNG bytes base64-encoded. Best-effort: returns
   * false when the platform is unreachable or rejects, so a failed report
   * delivery never throws into a user-facing flow.
   */
  async notifyImage(params: {
    externalId: string;
    imageBase64: string;
    caption?: string;
  }): Promise<boolean> {
    const body = await this.post("/notify", {
      externalId: params.externalId,
      format: "image",
      imageBase64: params.imageBase64,
      ...(params.caption ? { caption: params.caption } : {}),
    });
    return body !== null;
  }

  /** `POST /notify` in text/audio mode. Best-effort (returns false on failure). */
  async notifyText(params: {
    externalId: string;
    prompt: string;
    format?: "text" | "audio";
  }): Promise<boolean> {
    const body = await this.post("/notify", {
      externalId: params.externalId,
      format: params.format ?? "text",
      prompt: params.prompt,
    });
    return body !== null;
  }

  /**
   * `POST /ai/complete` — the platform inference gateway. Used for short chart
   * captions / NL summaries. Returns the completion text, or null when the
   * gateway is unavailable (callers fall back to a templated caption).
   */
  async aiComplete(params: {
    tier?: string;
    system?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }): Promise<string | null> {
    const body = await this.post("/ai/complete", {
      tier: params.tier ?? "cheap",
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages,
      ...(params.maxTokens ? { maxTokens: params.maxTokens } : {}),
    });
    if (body && typeof body === "object" && "text" in body && typeof (body).text === "string") {
      return (body as { text: string }).text;
    }
    return null;
  }

  /**
   * `POST /cron` — register a scheduled webhook back to the extension. Requires
   * the cronWebhooks capability grant (fail-closed upstream otherwise). Returns
   * the schedule id, or null on failure. `target` is the tracker path the kernel
   * will POST to on schedule (e.g. "/hooks/cron/weekly-report").
   */
  async scheduleCron(params: { target: string; schedule: string }): Promise<string | null> {
    const body = await this.post("/cron", { target: params.target, schedule: params.schedule });
    if (body && typeof body === "object" && "id" in body && typeof (body).id === "string") {
      return (body as { id: string }).id;
    }
    return null;
  }

  /** `DELETE /cron/:id` — remove a scheduled webhook. Best-effort. */
  async deleteCron(id: string): Promise<boolean> {
    const adminKey = this.getAdminKey();
    if (!adminKey) return false;
    try {
      const response = await fetch(`${this.baseUrl}/cron/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${adminKey}`, ...this.signedHeaders(adminKey, "") },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * SEC-2: firma HMAC de la llamada saliente al kernel sobre `${ts}.${rawBody}`,
   * byte-compatible con `verifyInboundSignature` del kernel (mismo esquema que
   * los webhooks entrantes). El kernel firma con el rawBody EXACTO; para GET el
   * kernel usa rawBody="" así que aquí firmamos "" en GET/DELETE. Si el kernel
   * está en modo `off` ignora estas cabeceras (paridad); en `accept`/`require`
   * las verifica. Sin admin key no se añaden (el caller ya devuelve null antes).
   */
  private signedHeaders(adminKey: string, rawBody: string): Record<string, string> {
    const timestamp = String(Date.now());
    return {
      [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(adminKey, timestamp, rawBody),
    };
  }

  private async get(path: string): Promise<unknown> {
    const adminKey = this.getAdminKey();
    if (!adminKey) return null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { authorization: `Bearer ${adminKey}`, ...this.signedHeaders(adminKey, "") },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    const adminKey = this.getAdminKey();
    if (!adminKey) return null;
    try {
      const rawBody = JSON.stringify(payload);
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminKey}`,
          "content-type": "application/json",
          ...this.signedHeaders(adminKey, rawBody),
        },
        body: rawBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return null;
      return await response.json().catch(() => ({}));
    } catch {
      return null;
    }
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** Null when MIKOSHI_PLATFORM_API_URL is not configured. */
    mikoshiPlatform: MikoshiPlatformClient | null;
  }
}

/** Build the client from env, or null when the platform URL is not set. */
export function createMikoshiPlatformClient(app: FastifyInstance): MikoshiPlatformClient | null {
  const baseUrl = app.env.MIKOSHI_PLATFORM_API_URL;
  if (!baseUrl) return null;
  return new MikoshiPlatformClient({
    baseUrl,
    getAdminKey: () => process.env.MIKOSHI_TRACKER_ADMIN_API_KEY || undefined,
  });
}
