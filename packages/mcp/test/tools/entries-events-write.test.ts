import { describe, expect, it, vi } from "vitest";

import { createServer } from "../../src/server/create-server";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getRegisteredTool(name: string, fetchImpl: typeof fetch) {
  const server = createServer({
    apiUrl: "https://tracker.example.com/api",
    apiToken: "test-token",
    timeoutMs: 2500,
    fetch: fetchImpl,
  });
  const tool = server.listRegisteredTools().find((entry) => entry.name === name);

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

const baseEntry = {
  id: "entry_1",
  userId: "user_1",
  entryTypeId: "type_1",
  entryTypeSlug: "habit",
  name: "Morning Run",
  description: null,
  category: "fitness",
  config: {},
  startDate: "2026-01-01",
  isActive: true,
  weekdays: [],
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
};

const baseEvent = {
  id: "event_1",
  entryId: "entry_1",
  userId: "user_1",
  occurredAt: "2026-05-22T08:00:00.000Z",
  dateKey: "2026-05-22",
  payload: { value: 5 },
  value: 5,
  completed: true,
  createdAt: "2026-05-22T08:00:00.000Z",
  updatedAt: "2026-05-22T08:00:00.000Z",
  mutations: [],
  attachments: [],
};

describe("entries_update tool", () => {
  it("includes id in inputSchema so the model can supply it", () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEntry }),
    );
    const tool = getRegisteredTool("entries_update", fetchImpl);
    const schema = tool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };

    expect(schema.safeParse({ name: "No id" }).success).toBe(false);
    expect(schema.safeParse({ id: "entry_1", name: "Morning Run" }).success).toBe(true);
  });

  it("calls PATCH /entries/:id with the patch body (no id in body) and returns the updated entry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: { ...baseEntry, name: "Evening Run", category: "health" } }),
    );
    const tool = getRegisteredTool("entries_update", fetchImpl);

    const result = await tool.handler({
      id: "entry_1",
      name: "Evening Run",
      category: "health",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/entries/entry_1");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ name: "Evening Run", category: "health" });
    expect(body).not.toHaveProperty("id");
    expect(result).toMatchObject({
      structuredContent: { item: { id: "entry_1", name: "Evening Run" } },
    });
  });
});

describe("events_update tool", () => {
  it("includes eventId in inputSchema so the model can supply it", () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEvent }),
    );
    const tool = getRegisteredTool("events_update", fetchImpl);
    const schema = tool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };

    expect(schema.safeParse({ note: "No eventId" }).success).toBe(false);
    expect(schema.safeParse({ eventId: "event_1", note: "Updated" }).success).toBe(true);
  });

  it("calls PATCH /events/:eventId with the patch body (no eventId in body) and returns the updated event", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEvent }),
    );
    const tool = getRegisteredTool("events_update", fetchImpl);

    const result = await tool.handler({
      eventId: "event_1",
      note: "Updated note",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/events/event_1");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ note: "Updated note" });
    expect(body).not.toHaveProperty("eventId");
    expect(result).toMatchObject({
      structuredContent: { item: { id: "event_1" } },
    });
  });
});

describe("entries_create tool", () => {
  it("calls POST /entries with the create body and returns the created entry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEntry }),
    );
    const tool = getRegisteredTool("entries_create", fetchImpl);

    const result = await tool.handler({
      entryTypeSlug: "habit",
      name: "Morning Run",
      config: {},
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/entries");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ entryTypeSlug: "habit", name: "Morning Run", config: {} });
    expect(result).toMatchObject({
      structuredContent: { item: { id: "entry_1", name: "Morning Run" } },
    });
  });
});

describe("entries_archive tool", () => {
  it("calls POST /entries/:id/archive with no body and returns the archived entry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: { ...baseEntry, isActive: false } }),
    );
    const tool = getRegisteredTool("entries_archive", fetchImpl);

    const result = await tool.handler({ id: "entry_1" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/entries/entry_1/archive");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(result).toMatchObject({
      structuredContent: { item: { id: "entry_1", isActive: false } },
    });
  });

  it("URL-encodes the entry id", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEntry }),
    );
    const tool = getRegisteredTool("entries_archive", fetchImpl);

    await tool.handler({ id: "entry/special" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://tracker.example.com/api/entries/entry%2Fspecial/archive",
    );
  });
});

describe("entries_restore tool", () => {
  it("calls POST /entries/:id/restore with no body and returns the restored entry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEntry }),
    );
    const tool = getRegisteredTool("entries_restore", fetchImpl);

    const result = await tool.handler({ id: "entry_1" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/entries/entry_1/restore");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(result).toMatchObject({
      structuredContent: { item: { id: "entry_1", isActive: true } },
    });
  });

  it("URL-encodes the entry id", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEntry }),
    );
    const tool = getRegisteredTool("entries_restore", fetchImpl);

    await tool.handler({ id: "entry/special" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://tracker.example.com/api/entries/entry%2Fspecial/restore",
    );
  });
});

describe("entries_add_event tool", () => {
  it("strips id from the request body and posts to /entries/:id/events", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({}),
    );
    const tool = getRegisteredTool("entries_add_event", fetchImpl);

    const result = await tool.handler({
      id: "entry_1",
      occurredAt: "2026-05-22T08:00:00.000Z",
      payload: { value: 5 },
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/entries/entry_1/events");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty("id");
    expect(body).toMatchObject({ occurredAt: "2026-05-22T08:00:00.000Z", payload: { value: 5 } });
    expect(result).toMatchObject({
      structuredContent: { entryId: "entry_1" },
    });
  });

  it("URL-encodes the entry id in the path", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({}),
    );
    const tool = getRegisteredTool("entries_add_event", fetchImpl);

    await tool.handler({
      id: "entry/special",
      occurredAt: "2026-05-22T08:00:00.000Z",
      payload: {},
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://tracker.example.com/api/entries/entry%2Fspecial/events",
    );
  });
});

describe("events_delete tool", () => {
  it("calls DELETE /events/:eventId and returns the delete record with mutationId", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ eventId: "event_1", mutationId: "mutation_1" }),
    );
    const tool = getRegisteredTool("events_delete", fetchImpl);

    const result = await tool.handler({ eventId: "event_1" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/events/event_1");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(result).toMatchObject({
      structuredContent: { eventId: "event_1", mutationId: "mutation_1" },
    });
  });

  it("URL-encodes the eventId", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ eventId: "event/special", mutationId: "mutation_1" }),
    );
    const tool = getRegisteredTool("events_delete", fetchImpl);

    await tool.handler({ eventId: "event/special" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://tracker.example.com/api/events/event%2Fspecial",
    );
  });
});

describe("events_undo tool", () => {
  it("calls POST /events/:eventId/undo with no body and returns the undone event", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEvent }),
    );
    const tool = getRegisteredTool("events_undo", fetchImpl);

    const result = await tool.handler({ eventId: "event_1" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://tracker.example.com/api/events/event_1/undo");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(result).toMatchObject({
      structuredContent: { item: { id: "event_1" } },
    });
  });

  it("URL-encodes the eventId", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ item: baseEvent }),
    );
    const tool = getRegisteredTool("events_undo", fetchImpl);

    await tool.handler({ eventId: "event/special" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://tracker.example.com/api/events/event%2Fspecial/undo",
    );
  });
});
