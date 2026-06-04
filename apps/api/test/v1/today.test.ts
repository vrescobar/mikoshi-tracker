import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

describe("v1 today summary", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("rejects unauthenticated calls", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary" });
    expect(response.statusCode).toBe(401);
  });

  it("returns a today summary reflecting a freshly created habit", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug: "habit_boolean", name: "Stretch", config: { frequencyType: "DAILY" } },
    });
    const createdBody = created.json() as Envelope<{ id: string }>;
    if (!createdBody.ok) throw new Error("expected success");

    const summary = await ctx.app.inject({ method: "GET", url: "/api/v1/today/summary", headers: { cookie } });
    const body = summary.json() as Envelope<{ summary: { totalCount: number; pendingItems: { name: string }[] } }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    expect(body.data.summary.totalCount).toBeGreaterThanOrEqual(1);
    expect(body.data.summary.pendingItems.some((i) => i.name === "Stretch")).toBe(true);
  });
});
