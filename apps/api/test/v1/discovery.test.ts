import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createV1DepsContext } from "./helpers/fullV1Deps";
import type { TestContext } from "../helpers/app";

describe("v1 discovery endpoints", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1 returns a machine-readable discovery index", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { version: string; resources: string[]; openapi: string; operationCount: number };
    expect(body.version).toBe("1");
    expect(body.openapi).toBe("/api/v1/openapi.json");
    expect(Array.isArray(body.resources)).toBe(true);
    expect(typeof body.operationCount).toBe("number");
  });

  it("GET /api/v1/openapi.json returns a valid 3.1 spec", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(response.statusCode).toBe(200);
    const spec = response.json() as { openapi: string; components: { securitySchemes: Record<string, unknown> } };
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("legacy /api/openapi.json is untouched and still served", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(response.statusCode).toBe(200);
    const spec = response.json() as { info: { title: string } };
    expect(spec.info.title).toBe("MikoshiTracker API");
  });
});
