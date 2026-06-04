import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

async function createEntry(app: TestContext["app"], cookie: string): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/entries/create",
    headers: { cookie },
    payload: { entryTypeSlug: "habit_boolean", name: "Meditate", config: { frequencyType: "DAILY" } },
  });
  const body = created.json() as Envelope<{ id: string }>;
  if (!body.ok) throw new Error("expected entry create success");
  return body.data.id;
}

describe("v1 events RPC flow", () => {
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
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/events" });
    expect(response.statusCode).toBe(401);
    const body = response.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("UNAUTHORIZED");
  });

  it("creates with lowercase source and stores it UPPERCASE (v1 source convergence)", async () => {
    const entryId = await createEntry(ctx.app, cookie);

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: { entryId, occurredAt: "2026-05-21T08:00:00.000Z", payload: { completed: true }, source: "ai" },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as Envelope<{ id: string; mutations: { source: string }[] }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    // Wire is lowercase "ai"; the stored mutation row keeps the legacy UPPERCASE.
    expect(body.data.mutations[0]?.source).toBe("AI");
  });

  it("lists, gets, updates, undoes, and deletes an event", async () => {
    const entryId = await createEntry(ctx.app, cookie);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/create",
      headers: { cookie },
      payload: { entryId, occurredAt: "2026-05-22T08:00:00.000Z", payload: { completed: true }, source: "web" },
    });
    const createdBody = created.json() as Envelope<{ id: string }>;
    if (!createdBody.ok) throw new Error("expected success");
    const eventId = createdBody.data.id;

    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/events", headers: { cookie } });
    const listBody = list.json() as Envelope<{ items: { id: string }[]; hasMore: boolean }>;
    expect(listBody.ok).toBe(true);
    if (listBody.ok) expect(listBody.data.items.some((e) => e.id === eventId)).toBe(true);

    const got = await ctx.app.inject({ method: "GET", url: `/api/v1/events/${eventId}`, headers: { cookie } });
    const gotBody = got.json() as Envelope<{ id: string }>;
    if (gotBody.ok) expect(gotBody.data.id).toBe(eventId);

    const updated = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/update",
      headers: { cookie },
      payload: { eventId, note: "edited" },
    });
    expect((updated.json() as Envelope<unknown>).ok).toBe(true);

    const undone = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/undo",
      headers: { cookie },
      payload: { eventId },
    });
    expect((undone.json() as Envelope<unknown>).ok).toBe(true);

    const deleted = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/delete",
      headers: { cookie },
      payload: { eventId },
    });
    const deletedBody = deleted.json() as Envelope<{ eventId: string; mutationId: string }>;
    expect(deletedBody.ok).toBe(true);
    if (deletedBody.ok) expect(deletedBody.data.eventId).toBe(eventId);
  });

  it("returns NOT_FOUND for an unknown event", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/events/nonexistent",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("NOT_FOUND");
  });
});
