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

const baseEventRecord = {
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
};

describe("entries_list read tool", () => {
  it("builds query params from entryTypeSlug, isActive, and query filters", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ items: [] }),
    );
    const tool = getRegisteredTool("entries_list", fetchImpl);

    await tool.handler({ entryTypeSlug: "habit", isActive: true, query: "run" });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("entryTypeSlug=habit");
    expect(url).toContain("isActive=true");
    expect(url).toContain("query=run");
  });

  it("returns empty-result summary when no entries match", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ items: [] }),
    );
    const tool = getRegisteredTool("entries_list", fetchImpl);

    const result = await tool.handler({});

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "No entries matched the requested filters.",
    });
  });

  it("lists entry names in the summary when entries are returned", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        items: [baseEntry, { ...baseEntry, id: "entry_2", name: "Evening Walk" }],
      }),
    );
    const tool = getRegisteredTool("entries_list", fetchImpl);

    const result = await tool.handler({});

    const summary = String(
      result.content?.[0] && typeof result.content[0] === "object" && "text" in result.content[0]
        ? result.content[0].text
        : "",
    );
    expect(summary).toContain("Morning Run");
    expect(summary).toContain("Evening Walk");
  });
});

describe("events_list read tool", () => {
  it("builds query params from cursor, limit, from, and to filters", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ items: [], cursor: null, hasMore: false }),
    );
    const tool = getRegisteredTool("events_list", fetchImpl);

    await tool.handler({ cursor: "cursor_abc", limit: 20, from: "2026-05-01", to: "2026-05-22" });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("cursor=cursor_abc");
    expect(url).toContain("limit=20");
    expect(url).toContain("from=2026-05-01");
    expect(url).toContain("to=2026-05-22");
  });

  it("includes 'more available' in the summary when hasMore is true", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ items: [baseEventRecord], cursor: "next_cursor", hasMore: true }),
    );
    const tool = getRegisteredTool("events_list", fetchImpl);

    const result = await tool.handler({});

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("more available"),
    });
  });

  it("omits 'more available' from the summary when hasMore is false", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ items: [baseEventRecord], cursor: null, hasMore: false }),
    );
    const tool = getRegisteredTool("events_list", fetchImpl);

    const result = await tool.handler({});

    const summary = String(
      result.content?.[0] && typeof result.content[0] === "object" && "text" in result.content[0]
        ? result.content[0].text
        : "",
    );
    expect(summary).not.toContain("more available");
  });
});

describe("aggregations_query read tool", () => {
  it("defaults groupBy to 'day' when not specified", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ buckets: [], total: { sum: {}, count: 0 }, weeklyAverage: null }),
    );
    const tool = getRegisteredTool("aggregations_query", fetchImpl);

    await tool.handler({ entryTypeSlug: "habit", from: "2026-05-01", to: "2026-05-22" });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("groupBy=day");
  });

  it("includes sum key-value pairs in the summary", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        buckets: [],
        total: { sum: { value: 42, duration: 120 }, count: 5 },
        weeklyAverage: null,
      }),
    );
    const tool = getRegisteredTool("aggregations_query", fetchImpl);

    const result = await tool.handler({
      entryTypeSlug: "habit",
      from: "2026-05-01",
      to: "2026-05-22",
    });

    const summary = String(
      result.content?.[0] && typeof result.content[0] === "object" && "text" in result.content[0]
        ? result.content[0].text
        : "",
    );
    expect(summary).toContain("value=42");
    expect(summary).toContain("duration=120");
  });

  it("includes weekly average count in the summary when weeklyAverage is present", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        buckets: [],
        total: { sum: {}, count: 10 },
        weeklyAverage: { sum: {}, count: 2 },
      }),
    );
    const tool = getRegisteredTool("aggregations_query", fetchImpl);

    const result = await tool.handler({
      entryTypeSlug: "habit",
      from: "2026-05-01",
      to: "2026-05-22",
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("weekly avg count 2"),
    });
  });
});
