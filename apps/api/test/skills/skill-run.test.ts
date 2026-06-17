import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

type RunnerHandler = (
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
) => void | Promise<void>;

async function startRunner(handler: RunnerHandler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function withRunner(
  handler: RunnerHandler,
  body: (url: string) => Promise<void>,
): Promise<void> {
  const runner = await startRunner(handler);
  const previous = process.env.MIKOSHI_SKILL_RUNNER_URL;
  process.env.MIKOSHI_SKILL_RUNNER_URL = runner.url;
  try {
    await body(runner.url);
  } finally {
    if (previous === undefined) delete process.env.MIKOSHI_SKILL_RUNNER_URL;
    else process.env.MIKOSHI_SKILL_RUNNER_URL = previous;
    await runner.close();
  }
}

function readJsonBody<T = unknown>(req: import("node:http").IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw) as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

describe("POST /api/skills/run", () => {
  let context: TestContext | undefined;
  beforeEach(async () => {
    context = await createTestContext();
  });
  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("forwards the call to the skill runner and returns its JSON output", async () => {
    const { cookie } = await signUp(context!.app);

    await withRunner(
      async (req, res) => {
        const body = await readJsonBody<{ skillSlug: string; input: unknown; userId: string }>(req);
        expect(req.method).toBe("POST");
        expect(req.url).toBe("/skills/mikoshi-tracker-food/run");
        expect(body.skillSlug).toBe("mikoshi-tracker-food");
        expect(body.input).toEqual({ tool: "food_log_from_input", text: "oatmeal" });
        expect(body.userId.length).toBeGreaterThan(0);
        expect(req.headers["x-user-id"]).toBe(body.userId);

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ action: "auto_posted", eventId: "evt_x" }));
      },
      async () => {
        const res = await context!.app.inject({
          method: "POST",
          url: "/api/skills/run",
          headers: { cookie, "content-type": "application/json" },
          payload: {
            skillSlug: "mikoshi-tracker-food",
            input: { tool: "food_log_from_input", text: "oatmeal" },
          },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ action: "auto_posted", eventId: "evt_x" });
      },
    );
  });

  it("rejects an unknown skillSlug with 404", async () => {
    const { cookie } = await signUp(context!.app);

    // No runner started — the call must fail before any network attempt because
    // the slug isn't in the allow-list.
    const res = await context!.app.inject({
      method: "POST",
      url: "/api/skills/run",
      headers: { cookie, "content-type": "application/json" },
      payload: { skillSlug: "not-a-real-skill", input: {} },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("NOT_FOUND");
  });

  it("returns 503 when the runner is unreachable", async () => {
    const { cookie } = await signUp(context!.app);

    const previous = process.env.MIKOSHI_SKILL_RUNNER_URL;
    // 127.0.0.1:1 is reserved; nothing listens there. fetch will get ECONNREFUSED.
    process.env.MIKOSHI_SKILL_RUNNER_URL = "http://127.0.0.1:1";
    try {
      const res = await context!.app.inject({
        method: "POST",
        url: "/api/skills/run",
        headers: { cookie, "content-type": "application/json" },
        payload: { skillSlug: "mikoshi-tracker-food", input: {} },
      });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { code: string }).code).toBe("RUNNER_UNREACHABLE");
    } finally {
      if (previous === undefined) delete process.env.MIKOSHI_SKILL_RUNNER_URL;
      else process.env.MIKOSHI_SKILL_RUNNER_URL = previous;
    }
  });

  it("returns 502 when the runner returns a non-2xx response", async () => {
    const { cookie } = await signUp(context!.app);

    await withRunner(
      (req, res) => {
        res.statusCode = 500;
        res.end("boom");
      },
      async () => {
        const res = await context!.app.inject({
          method: "POST",
          url: "/api/skills/run",
          headers: { cookie, "content-type": "application/json" },
          payload: { skillSlug: "mikoshi-tracker-food", input: {} },
        });
        expect(res.statusCode).toBe(502);
        expect((res.json() as { code: string }).code).toBe("RUNNER_ERROR");
      },
    );
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    const res = await context!.app.inject({
      method: "POST",
      url: "/api/skills/run",
      payload: { skillSlug: "mikoshi-tracker-food", input: {} },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/skills/:slug/health", () => {
  let context: TestContext | undefined;
  beforeEach(async () => {
    context = await createTestContext();
  });
  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("proxies the runner's health endpoint", async () => {
    const { cookie } = await signUp(context!.app);

    await withRunner(
      (req, res) => {
        expect(req.method).toBe("GET");
        expect(req.url).toBe("/skills/mikoshi-tracker-food/health");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            skillSlug: "mikoshi-tracker-food",
            enrolled: true,
            lastRunAt: "2026-05-22T10:00:00.000Z",
            lastError: null,
          }),
        );
      },
      async () => {
        const res = await context!.app.inject({
          method: "GET",
          url: "/api/skills/mikoshi-tracker-food/health",
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { enrolled: boolean };
        expect(body.enrolled).toBe(true);
      },
    );
  });

  it("404s on an unknown skill", async () => {
    const { cookie } = await signUp(context!.app);
    const res = await context!.app.inject({
      method: "GET",
      url: "/api/skills/not-a-skill/health",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
