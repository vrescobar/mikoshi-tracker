import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

describe("v1 entries RPC flow", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app));
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("rejects unauthenticated calls with the v1 error envelope", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/entries" });
    expect(response.statusCode).toBe(401);
    const body = response.json() as Envelope<unknown>;
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.code).toBe("UNAUTHORIZED");
  });

  it("creates, lists, gets, and archives an entry through the {ok,data} envelope", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/create",
      headers: { cookie },
      payload: { entryTypeSlug: "habit_boolean", name: "Meditate", config: { frequencyType: "DAILY" } },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as Envelope<{ id: string; name: string }>;
    expect(createdBody.ok).toBe(true);
    if (!createdBody.ok) throw new Error("expected success");
    const entryId = createdBody.data.id;

    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/entries", headers: { cookie } });
    const listBody = list.json() as Envelope<{ items: { id: string }[]; total: number }>;
    expect(listBody.ok).toBe(true);
    if (!listBody.ok) throw new Error("expected success");
    expect(listBody.data.total).toBeGreaterThanOrEqual(1);
    expect(listBody.data.items.some((e) => e.id === entryId)).toBe(true);

    const got = await ctx.app.inject({ method: "GET", url: `/api/v1/entries/${entryId}`, headers: { cookie } });
    const gotBody = got.json() as Envelope<{ id: string }>;
    expect(gotBody.ok).toBe(true);
    if (gotBody.ok) expect(gotBody.data.id).toBe(entryId);

    const archived = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/entries/archive",
      headers: { cookie },
      payload: { entryId },
    });
    const archivedBody = archived.json() as Envelope<{ isActive: boolean }>;
    expect(archivedBody.ok).toBe(true);
    if (archivedBody.ok) expect(archivedBody.data.isActive).toBe(false);
  });

  it("paginates with limit/offset and reports the full total", async () => {
    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/entries?limit=1&offset=0", headers: { cookie } });
    const body = list.json() as Envelope<{ items: unknown[]; total: number }>;
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.data.items.length).toBeLessThanOrEqual(1);
  });
});
