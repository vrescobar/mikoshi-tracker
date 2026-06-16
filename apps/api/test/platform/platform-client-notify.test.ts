import { describe, expect, it, vi } from "vitest";

import { MikoshiPlatformClient } from "../../src/modules/platform/mikoshi-platform-client";

function client(fetchMock: typeof fetch) {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", fetchMock);
  const c = new MikoshiPlatformClient({
    baseUrl: "http://platform.local/api/platform/v1",
    getAdminKey: () => "admin-key",
  });
  return { c, restore: () => vi.stubGlobal("fetch", original) };
}

describe("MikoshiPlatformClient POST methods", () => {
  it("notifyImage posts to /notify with format=image and returns true on 200", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "sent" }), { status: 200 }));
    const { c, restore } = client(fetchMock as unknown as typeof fetch);
    try {
      const ok = await c.notifyImage({ externalId: "ext_1", imageBase64: "AAA", caption: "hi" });
      expect(ok).toBe(true);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("http://platform.local/api/platform/v1/notify");
      expect((init as RequestInit).method).toBe("POST");
      const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(body).toMatchObject({ externalId: "ext_1", format: "image", imageBase64: "AAA", caption: "hi" });
    } finally {
      restore();
    }
  });

  it("notifyImage returns false on a non-2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    const { c, restore } = client(fetchMock as unknown as typeof fetch);
    try {
      expect(await c.notifyImage({ externalId: "ext_1", imageBase64: "AAA" })).toBe(false);
    } finally {
      restore();
    }
  });

  it("returns false when no admin key is configured (never calls fetch)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);
    try {
      const c = new MikoshiPlatformClient({
        baseUrl: "http://platform.local/api/platform/v1",
        getAdminKey: () => undefined,
      });
      expect(await c.notifyImage({ externalId: "ext_1", imageBase64: "AAA" })).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("fetch", original);
    }
  });

  it("aiComplete returns the completion text", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "Great week!" }), { status: 200 }));
    const { c, restore } = client(fetchMock as unknown as typeof fetch);
    try {
      const text = await c.aiComplete({ messages: [{ role: "user", content: "summarize" }] });
      expect(text).toBe("Great week!");
    } finally {
      restore();
    }
  });
});
