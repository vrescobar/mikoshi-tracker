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

  private async get(path: string): Promise<unknown> {
    const adminKey = this.getAdminKey();
    if (!adminKey) return null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { authorization: `Bearer ${adminKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return null;
      return await response.json();
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
