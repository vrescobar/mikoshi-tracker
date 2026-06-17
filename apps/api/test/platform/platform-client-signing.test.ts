import { afterEach, describe, expect, it, mock } from "bun:test";

import { MikoshiPlatformClient } from "../../src/modules/platform/mikoshi-platform-client";
import {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../../src/auth/webhook-signature";

/**
 * SEC-2: el cliente de la Platform API firma sus llamadas salientes al kernel
 * (HMAC sobre `${ts}.${rawBody}`), byte-compatible con verifyInboundSignature.
 * El kernel ignora la firma en modo `off` y la verifica en `accept`/`require`.
 */
const ADMIN_KEY = "tracker-admin-key-0123456789abcdef";

interface Captured {
  headers: Record<string, string>;
  rawBody: string;
}

const originalFetch = globalThis.fetch;

function stubFetch(captured: Captured[], jsonResponse: unknown): void {
  globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    captured.push({ headers, rawBody: init?.body ? String(init.body) : "" });
    return new Response(JSON.stringify(jsonResponse), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("MikoshiPlatformClient — firma de salida (SEC-2)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function client(): MikoshiPlatformClient {
    return new MikoshiPlatformClient({
      baseUrl: "http://127.0.0.1:7777/api/platform/v1",
      getAdminKey: () => ADMIN_KEY,
    });
  }

  it("POST /notify lleva firma válida sobre el body exacto", async () => {
    const captured: Captured[] = [];
    stubFetch(captured, { status: "sent" });
    await client().notifyText({ externalId: "ext-1", prompt: "hola" });

    expect(captured).toHaveLength(1);
    const { headers, rawBody } = captured[0]!;
    const timestamp = headers[WEBHOOK_TIMESTAMP_HEADER]!;
    const signature = headers[WEBHOOK_SIGNATURE_HEADER]!;
    expect(signature).toMatch(/^sha256=/);
    expect(verifyWebhookSignature({ adminKey: ADMIN_KEY, timestamp, rawBody, signature })).toBe(true);
    // Forjada (otra key) y tamper del body → inválida.
    expect(verifyWebhookSignature({ adminKey: "otra", timestamp, rawBody, signature })).toBe(false);
    expect(
      verifyWebhookSignature({ adminKey: ADMIN_KEY, timestamp, rawBody: rawBody + "x", signature }),
    ).toBe(false);
  });

  it("GET /cohorts/:id/members firma sobre body vacío (paridad con el kernel)", async () => {
    const captured: Captured[] = [];
    stubFetch(captured, []);
    await client().listCohortMembers("coh-1");

    const { headers, rawBody } = captured[0]!;
    expect(rawBody).toBe("");
    const timestamp = headers[WEBHOOK_TIMESTAMP_HEADER]!;
    const signature = headers[WEBHOOK_SIGNATURE_HEADER]!;
    // El kernel firma GET sobre rawBody="" → la firma debe verificar sobre "".
    expect(verifyWebhookSignature({ adminKey: ADMIN_KEY, timestamp, rawBody: "", signature })).toBe(true);
  });
});
