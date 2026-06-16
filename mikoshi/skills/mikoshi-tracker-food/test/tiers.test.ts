/**
 * Tests for the mikoshi-tracker-food tier pipeline and tool dispatch.
 *
 * Covers all six paths (manual + Tiers 0–4) and the confirmation gate by:
 *  - Running a Bun.serve mock for the MikoshiTracker API (entries/events)
 *  - Replacing global.fetch to intercept Claude and Brave API calls
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { runFoodSkill, type FoodEnvelope } from "../lib/tiers.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PERSONAL_TOKEN = "test-personal-token-food-xyz";
const PROXY_TOKEN = "test-proxy-bearer";
const BRAVE_KEY = "test-brave-key";

const ENTRY_ID = "entry-food-001";
const EVENT_ID = "event-food-abc";

const STUB_ENTRY_LIST = { items: [{ id: ENTRY_ID, entryTypeId: "et-food" }] };
const STUB_ENTRY_CREATED = { id: ENTRY_ID };
const STUB_EVENT_CREATED = {
  id: EVENT_ID,
  occurredAt: "2026-05-22T12:00:00.000Z",
  dateKey: "2026-05-22",
  payload: {
    name: "Tortilla española",
    kcal: 250,
    protein_g: 12,
    carbs_g: 20,
    fat_g: 10,
    source: "manual",
    confidence: 1.0,
  },
  createdAt: "2026-05-22T12:00:00.000Z",
};
const STUB_EVENT_LIST_EMPTY = { items: [] };
const STUB_EVENT_LIST_WITH_MATCH = {
  items: [
    {
      id: "hist-event-001",
      occurredAt: "2026-05-20T08:00:00.000Z",
      dateKey: "2026-05-20",
      payload: {
        name: "Tortilla española",
        kcal: 245,
        protein_g: 11,
        carbs_g: 19,
        fat_g: 9.5,
        source: "manual",
        confidence: 1.0,
      },
      createdAt: "2026-05-20T08:00:00.000Z",
    },
  ],
};

// ─── Mock MikoshiTracker API server ───────────────────────────────────────────

let mockServer: ReturnType<typeof Bun.serve>;
let mockBaseUrl: string;
let requestLog: Array<{ method: string; path: string; search: string; body: unknown }> = [];
let trackerResponseOverride: ((req: Request, pathname: string) => Response | null) | null = null;

beforeAll(() => {
  mockServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      let body: unknown;
      if (req.method !== "GET" && req.method !== "DELETE") {
        try {
          body = await req.json();
        } catch {
          body = undefined;
        }
      }
      requestLog.push({ method: req.method, path: pathname, search: url.search, body });

      if (trackerResponseOverride) {
        const override = trackerResponseOverride(req, pathname);
        if (override) return override;
      }

      if (req.method === "GET" && pathname === "/entries" && url.search.includes("food_meal")) {
        return Response.json(STUB_ENTRY_LIST);
      }
      if (req.method === "POST" && pathname === "/entries") {
        return Response.json(STUB_ENTRY_CREATED, { status: 201 });
      }
      if (req.method === "POST" && pathname.startsWith("/entries/") && pathname.endsWith("/events")) {
        return Response.json(STUB_EVENT_CREATED, { status: 201 });
      }
      if (req.method === "GET" && pathname === "/events") {
        return Response.json(STUB_EVENT_LIST_EMPTY);
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  mockBaseUrl = `http://127.0.0.1:${mockServer.port}`;
});

afterAll(() => {
  mockServer.stop(true);
});

// ─── Claude / Brave fetch queue ───────────────────────────────────────────────

type MockResponse = { body: unknown; status?: number };
let fetchQueue: MockResponse[] = [];
let originalFetch: typeof fetch;

beforeEach(() => {
  requestLog = [];
  trackerResponseOverride = null;
  fetchQueue = [];
});

// Install a global.fetch interceptor before each test suite that needs it.
// We keep the original to fall through for the tracker API (local server).
beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    // Let local tracker server calls pass through.
    if (url.startsWith("http://127.0.0.1")) {
      return originalFetch(input, init);
    }

    // Dequeue the next mock response for Claude / Brave calls.
    const next = fetchQueue.shift();
    if (!next) {
      throw new Error(
        `[tiers.test] Unexpected fetch call to ${url}. Add a response to fetchQueue.`,
      );
    }
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeEnv(overrides: Partial<{ brave: boolean }> = {}): Parameters<typeof runFoodSkill>[1] {
  return {
    MIKOSHI_TRACKER_PERSONAL_TOKEN: PERSONAL_TOKEN,
    MIKOSHI_TRACKER_API_URL: mockBaseUrl,
    MIKOSHI_LLM_PROXY_TOKEN: PROXY_TOKEN,
    // Point the proxy at a non-loopback host so the global.fetch interceptor
    // (which passes 127.0.0.1 straight through to the tracker mock) catches it
    // and serves the queued LLM responses. Without this the default
    // 127.0.0.1:7777 proxy URL leaks to the real network and every tier-0
    // classification call dies — which silently failed all tier-pipeline tests.
    MIKOSHI_LLM_PROXY_URL: "http://proxy.mock.test/api/v1/internal/skill-llm",
    ...(overrides.brave !== false ? { BRAVE_SEARCH_API_KEY: BRAVE_KEY } : {}),
  };
}

function makeEnvelope(tool: string, input: Record<string, unknown>): FoodEnvelope {
  return { tool, input };
}

// Mikoshi's skill-LLM proxy response envelope: {text, tier, attempts}.
function claudeText(json: unknown): MockResponse {
  return { body: { text: JSON.stringify(json), tier: "skill.text", attempts: [] } };
}

function braveResults(
  results: Array<{ title: string; url: string; description: string }>,
): MockResponse {
  return { body: { web: { results } } };
}

// ─── Missing token ─────────────────────────────────────────────────────────────

describe("missing token", () => {
  test("returns needs-enrolment when MIKOSHI_TRACKER_PERSONAL_TOKEN is absent", async () => {
    const result = await runFoodSkill(makeEnvelope("food_log_from_input", { input: "manzana" }), {
      MIKOSHI_LLM_PROXY_TOKEN: PROXY_TOKEN,
      MIKOSHI_TRACKER_API_URL: mockBaseUrl,
    });
    expect(result.status).toBe("failed");
    expect((result as { status: "failed"; error: string }).error).toBe("needs-enrolment");
  });
});

// ─── Manual path ──────────────────────────────────────────────────────────────

describe("manual path", () => {
  test("logs immediately without any Claude or Brave calls", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        manual: true,
        name: "Arroz con pollo",
        kcal: 420,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 8,
        meal_slot: "lunch",
      }),
      makeEnv(),
    );
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("logged");
    expect(out.source).toBe("manual");
    expect(out.confidence).toBe(1.0);
    expect(out.name).toBe("Arroz con pollo");
    expect(out.kcal).toBe(420);
    expect(typeof out.event_id).toBe("string");
    // No Claude/Brave calls were made.
    expect(fetchQueue).toHaveLength(0);
  });

  test("fails with helpful message when required manual fields are missing", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", { manual: true, name: "Manzana" }),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
    expect((result as { status: "failed"; error: string }).error).toMatch(/manual/i);
  });

  test("attaches the photo to the meal when an image is provided", async () => {
    trackerResponseOverride = (_req, pathname) => {
      if (pathname === "/attachments/event") {
        return Response.json({ attachment: { id: "att-1", url: "/api/attachments/att-1/file" } }, { status: 201 });
      }
      return null;
    };

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        manual: true,
        name: "Tostada con aguacate",
        kcal: 220,
        protein_g: 6,
        carbs_g: 24,
        fat_g: 12,
        image_base64: "ZmFrZWltYWdl",
      }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    expect((result.output as Record<string, unknown>).photo_attached).toBe(true);
    // The photo was POSTed to the event-pinned attachment endpoint.
    expect(requestLog.some((r) => r.method === "POST" && r.path === "/attachments/event")).toBe(true);
  });

  test("a failed photo upload is non-fatal (the meal is still logged)", async () => {
    trackerResponseOverride = (_req, pathname) => {
      if (pathname === "/attachments/event") return new Response("boom", { status: 500 });
      return null;
    };

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        manual: true,
        name: "Café con leche",
        kcal: 90,
        protein_g: 5,
        carbs_g: 8,
        fat_g: 4,
        image_base64: "ZmFrZWltYWdl",
      }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("logged");
    expect(out.photo_attached).toBe(false);
  });
});

// ─── Tier 1: label OCR ────────────────────────────────────────────────────────

describe("Tier 1 — label", () => {
  test("label image with high confidence → auto-posts without confirmation", async () => {
    // Tier 0 classification → "label"
    fetchQueue.push(
      claudeText({ classification: "label", food_name: "Galletas María", meal_slot: "snack", notes: null }),
    );
    // Tier 1 OCR vision
    fetchQueue.push(
      claudeText({
        product_name: "Galletas María Fontaneda",
        serving_description: "30g",
        kcal_per_serving: 130,
        protein_g: 2.5,
        carbs_g: 22,
        fat_g: 4,
        fiber_g: 0.6,
        sugar_g: 6,
        confidence: 0.92,
      }),
    );

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        input: "galletas",
        image_base64: "ZmFrZWltYWdl", // "fakeimage" base64
        image_mime_type: "image/jpeg",
      }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("logged");
    expect(out.source).toBe("label");
    expect(out.tier).toBe(1);
    // Confidence 0.92 ≥ 0.85 and source=label → auto-post
    expect(typeof out.event_id).toBe("string");
    // All Claude fetch calls consumed
    expect(fetchQueue).toHaveLength(0);
  });
});

// ─── Tier 2: similar_to_event ─────────────────────────────────────────────────

describe("Tier 2 — similar_to_event", () => {
  test("matches a recent event → auto-posts (high confidence)", async () => {
    // Override tracker to return history
    trackerResponseOverride = (_req, pathname) => {
      if (pathname === "/events") return Response.json(STUB_EVENT_LIST_WITH_MATCH);
      return null;
    };

    // Tier 0 classification
    fetchQueue.push(
      claudeText({ classification: "dish", food_name: "Tortilla española", meal_slot: "dinner", notes: null }),
    );
    // Tier 2 similarity check: return the history event id
    fetchQueue.push({ body: { text: "hist-event-001", tier: "skill.text", attempts: [] } });

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", { input: "tortilla española" }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("logged");
    expect(out.source).toBe("similar_to_event");
    expect(out.tier).toBe(2);
    expect(out.similar_to_event_id).toBe("hist-event-001");
    expect(fetchQueue).toHaveLength(0);
  });
});

// ─── Tier 3: web_lookup ───────────────────────────────────────────────────────

describe("Tier 3 — web_lookup", () => {
  test("no history match + Brave results → pending_confirmation (conf ≤ 0.70)", async () => {
    // Tier 0 classification
    fetchQueue.push(
      claudeText({ classification: "text_only", food_name: "Gazpacho andaluz", meal_slot: "lunch", notes: null }),
    );
    // Tier 2 similarity: history is empty → returns {matched:false} immediately, NO Claude call.
    // Tier 3 Brave search
    fetchQueue.push(
      braveResults([
        { title: "Gazpacho calories", url: "https://a.com", description: "~100kcal per 250ml" },
      ]),
    );
    // Tier 3 Claude reconcile
    fetchQueue.push(
      claudeText({
        name: "Gazpacho andaluz (250ml)",
        kcal: 100,
        protein_g: 2,
        carbs_g: 12,
        fat_g: 4,
        fiber_g: 1,
        confidence: 0.65,
        reasoning: "Based on search results",
      }),
    );

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", { input: "gazpacho" }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("pending_confirmation");
    expect(out.tier).toBe(3);
    const proposed = out.proposed as Record<string, unknown>;
    expect(proposed.source).toBe("web_lookup");
    expect((proposed.confidence as number)).toBeLessThanOrEqual(0.70);
    expect(typeof out.message).toBe("string");
    expect((out.message as string).length).toBeGreaterThan(0);
    expect(fetchQueue).toHaveLength(0);
  });
});

// ─── Tier 4: vision_only ──────────────────────────────────────────────────────

describe("Tier 4 — vision_only", () => {
  test("no history + no Brave key + image → pending_confirmation (conf ≤ 0.55)", async () => {
    // Tier 0 classification
    fetchQueue.push(
      claudeText({ classification: "dish", food_name: "Paella valenciana", meal_slot: "lunch", notes: null }),
    );
    // Tier 2 similarity: history is empty → returns {matched:false} immediately, NO Claude call.
    // Tier 3 skipped: no BRAVE_SEARCH_API_KEY.
    // Tier 4 Claude vision
    fetchQueue.push(
      claudeText({
        name: "Paella valenciana",
        description: "Rice dish with seafood and vegetables",
        kcal: 380,
        protein_g: 22,
        carbs_g: 50,
        fat_g: 9,
        confidence: 0.45,
      }),
    );

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        input: "paella",
        image_base64: "ZmFrZWltYWdl",
        image_mime_type: "image/jpeg",
      }),
      makeEnv({ brave: false }), // no Brave key → skip Tier 3
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("pending_confirmation");
    expect(out.tier).toBe(4);
    const proposed = out.proposed as Record<string, unknown>;
    expect(proposed.source).toBe("vision_only");
    expect((proposed.confidence as number)).toBeLessThanOrEqual(0.55);
    expect(fetchQueue).toHaveLength(0);
  });
});

// ─── Pipeline failure ─────────────────────────────────────────────────────────

describe("pipeline failure", () => {
  test("text-only input with no history, no Brave key, no image → failed", async () => {
    // Tier 0 classification
    fetchQueue.push(
      claudeText({ classification: "text_only", food_name: "Algo desconocido", meal_slot: null, notes: null }),
    );
    // Tier 2 similarity: history is empty → NO Claude call.
    // Tier 3 skipped (no Brave key), Tier 4 skipped (no image).

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", { input: "algo muy oscuro" }),
      makeEnv({ brave: false }),
    );

    expect(result.status).toBe("failed");
    expect(fetchQueue).toHaveLength(0);
  });

  test("no input and no image → fails immediately without API calls", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {}),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
    expect((result as { status: "failed"; error: string }).error).toMatch(/input|imagen/i);
  });
});

// ─── food_query_range ─────────────────────────────────────────────────────────

describe("food_query_range", () => {
  test("queries events over date range and returns totals", async () => {
    trackerResponseOverride = (_req, pathname) => {
      if (pathname === "/events") {
        return Response.json({
          items: [
            {
              id: "evt-1",
              occurredAt: "2026-05-21T12:00:00.000Z",
              dateKey: "2026-05-21",
              payload: { name: "Ensalada", kcal: 180, protein_g: 5, carbs_g: 20, fat_g: 8, source: "manual", confidence: 1 },
              createdAt: "2026-05-21T12:00:00.000Z",
            },
            {
              id: "evt-2",
              occurredAt: "2026-05-21T19:00:00.000Z",
              dateKey: "2026-05-21",
              payload: { name: "Pollo a la plancha", kcal: 320, protein_g: 40, carbs_g: 2, fat_g: 12, source: "manual", confidence: 1 },
              createdAt: "2026-05-21T19:00:00.000Z",
            },
          ],
        });
      }
      return null;
    };

    const result = await runFoodSkill(
      makeEnvelope("food_query_range", { from: "2026-05-21", to: "2026-05-21" }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.count).toBe(2);
    expect(out.total_kcal).toBe(500);
    expect(out.from).toBe("2026-05-21");
    expect(out.to).toBe("2026-05-21");
    const events = out.events as unknown[];
    expect(events).toHaveLength(2);
  });

  test("fails when from or to is missing", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_query_range", { from: "2026-05-21" }),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
  });
});

// ─── food_edit_event ──────────────────────────────────────────────────────────

describe("food_edit_event", () => {
  test("patches event and returns updated payload", async () => {
    trackerResponseOverride = (_req, pathname) => {
      if (pathname.startsWith("/events/")) {
        return Response.json({
          id: "evt-patch",
          occurredAt: "2026-05-22T12:00:00.000Z",
          dateKey: "2026-05-22",
          payload: { name: "Arroz blanco", kcal: 200, protein_g: 4, carbs_g: 44, fat_g: 1, source: "manual", confidence: 1 },
          createdAt: "2026-05-22T12:00:00.000Z",
        });
      }
      return null;
    };

    const result = await runFoodSkill(
      makeEnvelope("food_edit_event", { event_id: "evt-patch", kcal: 200, name: "Arroz blanco" }),
      makeEnv(),
    );
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.event_id).toBe("evt-patch");
    expect(out.kcal).toBe(200);
  });

  test("fails when no fields are provided", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_edit_event", { event_id: "evt-1" }),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
  });

  test("fails when event_id is missing", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_edit_event", { kcal: 300 }),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
  });
});

// ─── food_delete_event ────────────────────────────────────────────────────────

describe("food_delete_event", () => {
  test("soft-deletes an event successfully", async () => {
    trackerResponseOverride = (_req, pathname) => {
      if (pathname.startsWith("/events/")) {
        return new Response(null, { status: 204 });
      }
      return null;
    };

    const result = await runFoodSkill(
      makeEnvelope("food_delete_event", { event_id: "evt-del" }),
      makeEnv(),
    );
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.event_id).toBe("evt-del");
    expect((out.message as string)).toMatch(/elimin/i);
  });

  test("fails when event_id is missing", async () => {
    const result = await runFoodSkill(
      makeEnvelope("food_delete_event", {}),
      makeEnv(),
    );
    expect(result.status).toBe("failed");
  });
});

// ─── Unknown tool ─────────────────────────────────────────────────────────────

describe("unknown tool", () => {
  test("returns failed with unknown tool message", async () => {
    const result = await runFoodSkill(makeEnvelope("food_unknown_tool", {}), makeEnv());
    expect(result.status).toBe("failed");
    expect((result as { status: "failed"; error: string }).error).toMatch(/desconocida/i);
  });
});

// ─── Confirmation gate edge cases ─────────────────────────────────────────────

describe("confirmation gate", () => {
  test("label with confidence 0.84 → pending_confirmation, not logged", async () => {
    // Tier 0 → "label"
    fetchQueue.push(
      claudeText({ classification: "label", food_name: "Yogur natural", meal_slot: null, notes: null }),
    );
    // Tier 1 OCR → low confidence 0.80
    fetchQueue.push(
      claudeText({
        product_name: "Yogur natural",
        serving_description: "125g",
        kcal_per_serving: 75,
        protein_g: 4,
        carbs_g: 9,
        fat_g: 1.5,
        fiber_g: null,
        sugar_g: 8,
        confidence: 0.80, // below 0.85 threshold
      }),
    );

    const result = await runFoodSkill(
      makeEnvelope("food_log_from_input", {
        input: "yogur",
        image_base64: "ZmFrZWltYWdl",
        image_mime_type: "image/jpeg",
      }),
      makeEnv(),
    );

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const out = result.output as Record<string, unknown>;
    expect(out.action).toBe("pending_confirmation");
    // No event was posted
    const postRequest = requestLog.find(
      (r) => r.method === "POST" && (r.path as string).includes("/events"),
    );
    expect(postRequest).toBeUndefined();
  });
});
