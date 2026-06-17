import sharp from "sharp";
import { afterEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer();
}

async function createFoodEntry(context: TestContext, cookie: string): Promise<string> {
  const res = await context.app.inject({
    method: "POST",
    url: "/api/entries",
    headers: { cookie },
    payload: { entryTypeSlug: "food_meal", name: "Meals", config: {} },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { item: { id: string } }).item.id;
}

async function createFoodEvent(
  context: TestContext,
  cookie: string,
  entryId: string,
): Promise<string> {
  const res = await context.app.inject({
    method: "POST",
    url: `/api/entries/${entryId}/events`,
    headers: { cookie },
    payload: {
      occurredAt: "2026-03-11T12:00:00.000Z",
      payload: {
        name: "Oatmeal",
        kcal: 320,
        protein_g: 12,
        carbs_g: 55,
        fat_g: 6,
        source: "manual",
        confidence: 1.0,
      },
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { item: { id: string } }).item.id;
}

describe("attachments pinned to events", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("uploads an image against an event and surfaces it on the event detail", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app);
    const entryId = await createFoodEntry(context, cookie);
    const eventId = await createFoodEvent(context, cookie, entryId);

    const buffer = await png(64, 64);
    const res = await context.app.inject({
      method: "POST",
      url: "/api/attachments/event",
      headers: { cookie, "content-type": "application/json" },
      payload: { eventId, data: buffer.toString("base64"), originalName: "meal.png" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      attachment: {
        id: string;
        mimeType: string;
        mutationId: string;
        url: string;
      };
    };
    expect(body.attachment.id).toMatch(/^[a-z0-9]+$/);
    expect(body.attachment.mimeType).toBe("image/png");
    expect(body.attachment.url).toBe(`/api/attachments/${body.attachment.id}/file`);

    // The event detail should now include the new attachment in its gallery.
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/events/${eventId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as {
      item: { attachments: Array<{ id: string }> };
    };
    expect(detailBody.item.attachments.map((a) => a.id)).toContain(body.attachment.id);
  });

  it("rejects an event id the caller does not own", async () => {
    context = await createTestContext();
    const owner = await signUp(context.app, { email: "owner@example.com" });
    const other = await signUp(context.app, { email: "other@example.com" });

    const entryId = await createFoodEntry(context, owner.cookie);
    const eventId = await createFoodEvent(context, owner.cookie, entryId);

    const buffer = await png(32, 32);
    const res = await context.app.inject({
      method: "POST",
      url: "/api/attachments/event",
      headers: { cookie: other.cookie, "content-type": "application/json" },
      payload: { eventId, data: buffer.toString("base64") },
    });
    expect(res.statusCode).toBe(404);
  });

  it("allows deleting a per-event attachment", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app);
    const entryId = await createFoodEntry(context, cookie);
    const eventId = await createFoodEvent(context, cookie, entryId);

    const buffer = await png(32, 32);
    const upload = await context.app.inject({
      method: "POST",
      url: "/api/attachments/event",
      headers: { cookie, "content-type": "application/json" },
      payload: { eventId, data: buffer.toString("base64") },
    });
    const attachmentId = (upload.json() as { attachment: { id: string } }).attachment.id;

    const del = await context.app.inject({
      method: "DELETE",
      url: `/api/attachments/${attachmentId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    // Event detail no longer lists it.
    const detail = await context.app.inject({
      method: "GET",
      url: `/api/events/${eventId}`,
      headers: { cookie },
    });
    const detailBody = detail.json() as {
      item: { attachments: Array<{ id: string }> };
    };
    expect(detailBody.item.attachments.map((a) => a.id)).not.toContain(attachmentId);
  });

  it("requires a non-empty eventId", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app);

    const res = await context.app.inject({
      method: "POST",
      url: "/api/attachments/event",
      headers: { cookie, "content-type": "application/json" },
      payload: { eventId: "", data: "iVBORw0KGgo=" },
    });
    expect(res.statusCode).toBe(400);
  });
});
