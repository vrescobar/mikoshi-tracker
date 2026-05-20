import { describe, expect, it, vi } from "vitest";

import { createServer } from "../../src/server/create-server";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getRegisteredTool(name: string, fetchImpl: typeof fetch) {
  const server = createServer({
    apiUrl: "https://habit.example.com/api",
    apiToken: "secret-token",
    timeoutMs: 2500,
    fetch: fetchImpl,
  });
  const tool = server.listRegisteredTools().find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return tool;
}

const attachmentMetadata = {
  id: "att_1",
  mutationId: "mut_1",
  kind: "image" as const,
  mimeType: "image/jpeg",
  size: 1234,
  width: 1024,
  height: 768,
  originalName: "meal.jpg",
  createdAt: "2026-03-11T12:00:00.000Z",
  url: "/api/attachments/att_1/file",
};

describe("attachment tools", () => {
  it("uploads an image via the base64 endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ attachment: attachmentMetadata }));
    const tool = getRegisteredTool("attachment_upload", fetchImpl);

    const result = await tool.handler({ mutationId: "mut_1", data: "aGVsbG8=", originalName: "meal.jpg" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://habit.example.com/api/attachments/base64");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      mutationId: "mut_1",
      data: "aGVsbG8=",
      originalName: "meal.jpg",
    });
    expect(result).toMatchObject({ structuredContent: { attachment: { id: "att_1" } } });
  });

  it("lists attachments for an entry", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ attachments: [attachmentMetadata], limit: 10, remaining: 9 }));
    const tool = getRegisteredTool("attachment_list", fetchImpl);

    const result = await tool.handler({ mutationId: "mut_1" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://habit.example.com/api/attachments?mutationId=mut_1");
    expect(result).toMatchObject({ structuredContent: { remaining: 9 } });
  });

  it("returns a stored attachment as an image content block", async () => {
    const pixels = new Uint8Array([1, 2, 3, 4, 5]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(pixels, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const tool = getRegisteredTool("attachment_get", fetchImpl);

    const result = await tool.handler({ id: "att_1", width: 768 });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://habit.example.com/api/attachments/att_1/file?w=768");
    const imageBlock = result.content?.find((entry) => entry.type === "image");
    expect(imageBlock).toMatchObject({
      type: "image",
      mimeType: "image/jpeg",
      data: Buffer.from(pixels).toString("base64"),
    });
  });
});
