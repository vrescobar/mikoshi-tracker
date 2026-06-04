import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import { createHabit } from "../../src/modules/habits/habit.service";
import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

const TODAY = "2026-03-11T12:00:00.000Z";

function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("v1 attachments + skills", () => {
  let ctx: TestContext;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    const session = await signUp(ctx.app);
    cookie = session.cookie;
    userId = session.body.user.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("uploads a base64 image to a mutation, lists, then deletes it", async () => {
    const habit = await createHabit(
      { db: ctx.app.db },
      { userId, input: { name: "Tidy up", frequency: { type: "daily" } }, today: "2026-03-11" },
    );
    const result = await completeHabitForToday(
      { db: ctx.app.db },
      { userId, habitId: habit.id, source: "web", timestamp: TODAY },
    );
    const mutationId = result.mutation.id;

    const uploaded = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/attachments/upload-base64",
      headers: { cookie },
      payload: { mutationId, data: (await png(40, 30)).toString("base64") },
    });
    expect(uploaded.statusCode).toBe(201);
    const upBody = uploaded.json() as Envelope<{ id: string; mimeType: string }>;
    expect(upBody.ok).toBe(true);
    if (!upBody.ok) throw new Error("expected success");
    expect(upBody.data.mimeType).toBe("image/png");
    const attachmentId = upBody.data.id;

    const list = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/attachments?mutationId=${mutationId}`,
      headers: { cookie },
    });
    const listBody = list.json() as Envelope<{ attachments: { id: string }[] }>;
    expect(listBody.ok).toBe(true);
    if (listBody.ok) expect(listBody.data.attachments.some((a) => a.id === attachmentId)).toBe(true);

    const del = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/attachments/delete",
      headers: { cookie },
      payload: { id: attachmentId },
    });
    expect((del.json() as Envelope<unknown>).ok).toBe(true);
  });

  it("rejects a list without mutationId or habitId", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/attachments", headers: { cookie } });
    expect(res.statusCode).toBe(400);
    const body = res.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("BAD_REQUEST");
  });

  it("lists the allow-listed skill slugs", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/skills", headers: { cookie } });
    const body = res.json() as Envelope<{ skills: string[] }>;
    expect(body.ok).toBe(true);
    if (body.ok) expect(Array.isArray(body.data.skills)).toBe(true);
  });

  it("rejects running a skill that is not registered", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/skills/run",
      headers: { cookie },
      payload: { skillSlug: "not_a_real_skill", input: {} },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as Envelope<unknown>;
    if (!body.ok) expect(body.code).toBe("NOT_FOUND");
  });
});
