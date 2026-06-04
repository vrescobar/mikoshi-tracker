import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

describe("v1 runtime middleware", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("mints an X-Request-ID when none is supplied", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/entries", headers: { cookie } });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("echoes an inbound X-Request-ID", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/entries",
      headers: { cookie, "x-request-id": "trace-abc-123" },
    });
    expect(response.headers["x-request-id"]).toBe("trace-abc-123");
  });

  it("echoes the correlation id on error responses too", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/entries" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("rejects an over-cap pagination limit with a 400", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/entries?limit=99999",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
  });
});
