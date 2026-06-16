import { describe, expect, it, vi } from "vitest";

import { createServer } from "../../src/server/create-server";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function getRegisteredTool(name: string, fetchImpl: typeof fetch) {
  const server = createServer({
    apiUrl: "https://habit.example.com/api",
    apiToken: "secret-token",
    timeoutMs: 2500,
    fetch: fetchImpl,
  });
  const tool = server.listRegisteredTools().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe("diet + food v1 tools", () => {
  it("food_search hits /v1/food/search and unwraps the envelope", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        ok: true,
        data: {
          results: [
            {
              kind: "meal",
              eventId: "ev_1",
              name: "Oatmeal",
              kcal: 320,
              protein_g: 12,
              carbs_g: 54,
              fat_g: 6,
              fiber_g: null,
              defaultPortionG: null,
              isRecipe: null,
              usageCount: 3,
              lastUsedAt: "2026-05-03T08:00:00.000Z",
            },
          ],
        },
      }),
    );
    const tool = getRegisteredTool("food_search", fetchImpl);

    const result = (await tool.handler({ q: "oat" })) as unknown as {
      structuredContent: { results: { name: string }[] };
    };

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://habit.example.com/api/v1/food/search?q=oat");
    expect(result.structuredContent.results[0]?.name).toBe("Oatmeal");
  });

  it("diet_set_goal POSTs to /v1/diet/goal", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ ok: true, data: { goal: { kcalTarget: 2100, objective: "maintain" } } }),
    );
    const tool = getRegisteredTool("diet_set_goal", fetchImpl);

    await tool.handler({ kcalTarget: 2100, objective: "maintain" });

    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://habit.example.com/api/v1/diet/goal");
    expect((call?.[1] as RequestInit | undefined)?.method).toBe("POST");
  });

  it("diet_get_goal reads /v1/diet/goal and tolerates a null goal", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse({ ok: true, data: { goal: null } }));
    const tool = getRegisteredTool("diet_get_goal", fetchImpl);

    const result = (await tool.handler({})) as unknown as { structuredContent: { goal: unknown } };

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://habit.example.com/api/v1/diet/goal");
    expect(result.structuredContent.goal).toBeNull();
  });
});
