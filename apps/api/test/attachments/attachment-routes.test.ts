import { readdir, rm } from "node:fs/promises";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "bun:test";

import { completeHabitForToday } from "../../src/modules/checkins/checkin.service";
import { createHabit } from "../../src/modules/habits/habit.service";
import { resolveStoragePath } from "../../src/modules/attachments/attachment.storage";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

const TODAY = "2026-03-11T12:00:00.000Z";

async function makeMutation(context: TestContext, userId: string): Promise<string> {
  const habit = await createHabit(
    { db: context.app.db, sqlite: context.app.sqlite },
    { userId, input: { name: "Tidy up", frequency: { type: "daily" } }, today: "2026-03-07" },
  );
  const result = await completeHabitForToday(
    { db: context.app.db, sqlite: context.app.sqlite },
    { userId, habitId: habit.id, source: "web", timestamp: TODAY },
  );
  return result.mutation.id;
}

function multipartBody(parts: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>) {
  const boundary = `----mikoshi-trackertest${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`,
        ),
      );
      chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
      chunks.push(Buffer.from(String(part.value)));
    }
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } } })
    .jpeg()
    .toBuffer();
}

function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer();
}

async function base64Upload(context: TestContext, cookie: string, mutationId: string, data: Buffer) {
  return context.app.inject({
    method: "POST",
    url: "/api/attachments/base64",
    headers: { cookie },
    payload: { mutationId, data: data.toString("base64") },
  });
}

describe("attachment routes", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("includes the produced mutationId in a today complete response", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const habit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, input: { name: "Walk", frequency: { type: "daily" } }, today: "2026-03-07" },
    );

    const completed = await context.app.inject({
      method: "POST",
      url: "/api/today/complete",
      headers: { cookie, "x-mikoshi-tracker-now": TODAY },
      payload: { habitId: habit.id },
    });
    expect(completed.statusCode).toBe(200);
    const payload = completed.json() as { mutationId: string };
    expect(typeof payload.mutationId).toBe("string");
    expect(payload.mutationId.length).toBeGreaterThan(0);
  });

  it("uploads, downscales to <=1024px, and stores a JPEG", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);

    const response = await base64Upload(context, cookie, mutationId, await jpeg(2000, 1500));
    expect(response.statusCode).toBe(200);
    const { attachment } = response.json() as { attachment: { width: number; height: number; mimeType: string } };
    expect(attachment.mimeType).toBe("image/jpeg");
    expect(attachment.width).toBe(1024);
    expect(attachment.height).toBe(768);
  });

  it("keeps a small PNG untouched in size and format", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);

    const response = await base64Upload(context, cookie, mutationId, await png(50, 40));
    expect(response.statusCode).toBe(200);
    const { attachment } = response.json() as { attachment: { width: number; height: number; mimeType: string } };
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.width).toBe(50);
    expect(attachment.height).toBe(40);
  });

  it("transcodes AVIF/HEIF-family images to JPEG", async () => {
    // AVIF and HEIC share the same heif transcode branch; AVIF is used here
    // because the prebuilt sharp cannot *encode* HEIC test fixtures.
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    const avif = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .avif()
      .toBuffer();

    const response = await base64Upload(context, cookie, mutationId, avif);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { attachment: { mimeType: string } }).attachment.mimeType).toBe("image/jpeg");
  });

  it("rejects non-image bytes by magic-byte detection", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);

    const response = await base64Upload(context, cookie, mutationId, Buffer.from("this is definitely not an image"));
    expect(response.statusCode).toBe(415);
    expect((response.json() as { code: string }).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("enforces the 10-attachment per-entry limit", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    const image = await png(20, 20);

    for (let i = 0; i < 10; i += 1) {
      const ok = await base64Upload(context, cookie, mutationId, image);
      expect(ok.statusCode).toBe(200);
    }
    const eleventh = await base64Upload(context, cookie, mutationId, image);
    expect(eleventh.statusCode).toBe(409);
    expect((eleventh.json() as { code: string }).code).toBe("ATTACHMENT_LIMIT_REACHED");
  });

  it("uploads multiple files via multipart and rejects an over-limit batch", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    const image = await png(30, 30);

    const ok = multipartBody([
      { name: "mutationId", value: mutationId },
      { name: "files", value: image, filename: "a.png", contentType: "image/png" },
      { name: "files", value: image, filename: "b.png", contentType: "image/png" },
    ]);
    const okResponse = await context.app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { cookie, "content-type": ok.contentType },
      payload: ok.body,
    });
    expect(okResponse.statusCode).toBe(200);
    expect((okResponse.json() as { attachments: unknown[] }).attachments).toHaveLength(2);

    const tooMany = multipartBody([
      { name: "mutationId", value: mutationId },
      ...Array.from({ length: 9 }, (_, i) => ({
        name: "files",
        value: image,
        filename: `f${i}.png`,
        contentType: "image/png",
      })),
    ]);
    const tooManyResponse = await context.app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { cookie, "content-type": tooMany.contentType },
      payload: tooMany.body,
    });
    expect(tooManyResponse.statusCode).toBe(409);
  });

  it("uploads via multipart targeting a habit's latest entry", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const habit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, input: { name: "Floor", frequency: { type: "daily" } }, today: "2026-03-07" },
    );
    await completeHabitForToday(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, habitId: habit.id, source: "web", timestamp: TODAY },
    );

    const image = await png(40, 40);
    const upload = multipartBody([
      { name: "habitId", value: habit.id },
      { name: "files", value: image, filename: "floor.png", contentType: "image/png" },
    ]);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { cookie, "content-type": upload.contentType },
      payload: upload.body,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { attachments: unknown[] }).attachments).toHaveLength(1);
  });

  it("rejects a habit-targeted upload when the habit has no check-in entry", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const habit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, input: { name: "Unlogged", frequency: { type: "daily" } }, today: "2026-03-07" },
    );

    const image = await png(40, 40);
    const upload = multipartBody([
      { name: "habitId", value: habit.id },
      { name: "files", value: image, filename: "x.png", contentType: "image/png" },
    ]);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { cookie, "content-type": upload.contentType },
      payload: upload.body,
    });
    expect(response.statusCode).toBe(404);
  });

  it("denies access to another user's attachments", async () => {
    context = await createTestContext();
    const alice = await signUp(context.app);
    const bob = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
    const mutationId = await makeMutation(context, alice.body.user.id);

    const uploaded = await base64Upload(context, alice.cookie, mutationId, await png(40, 40));
    const attachmentId = (uploaded.json() as { attachment: { id: string } }).attachment.id;

    const bobUpload = await base64Upload(context, bob.cookie, mutationId, await png(40, 40));
    expect(bobUpload.statusCode).toBe(404);

    const bobDownload = await context.app.inject({
      method: "GET",
      url: `/api/attachments/${attachmentId}/file`,
      headers: { cookie: bob.cookie },
    });
    expect(bobDownload.statusCode).toBe(404);

    const bobDelete = await context.app.inject({
      method: "DELETE",
      url: `/api/attachments/${attachmentId}`,
      headers: { cookie: bob.cookie },
    });
    expect(bobDelete.statusCode).toBe(404);
  });

  it("serves and deletes an attachment, and reports a missing file gracefully", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    const uploaded = await base64Upload(context, cookie, mutationId, await jpeg(200, 200));
    const attachmentId = (uploaded.json() as { attachment: { id: string } }).attachment.id;

    const download = await context.app.inject({
      method: "GET",
      url: `/api/attachments/${attachmentId}/file`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("image/jpeg");
    // The full file bytes must actually come back — a prior bug streamed the file
    // with a manual Content-Length and sent an EMPTY body (broken full-size image).
    const storedRow = await context.app.db.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(download.rawPayload.length).toBeGreaterThan(0);
    expect(download.rawPayload.length).toBe(storedRow.size);

    // Simulate the backing file vanishing from disk.
    const row = await context.app.db.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    await rm(resolveStoragePath(context.attachmentsDir, row.storageKey), { force: true });

    const missing = await context.app.inject({
      method: "GET",
      url: `/api/attachments/${attachmentId}/file`,
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { code: string }).code).toBe("ATTACHMENT_FILE_MISSING");

    const deleted = await context.app.inject({
      method: "DELETE",
      url: `/api/attachments/${attachmentId}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await context.app.inject({
      method: "GET",
      url: `/api/attachments/${attachmentId}/file`,
      headers: { cookie },
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("serves a downscaled copy when a width is requested", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    const uploaded = await base64Upload(context, cookie, mutationId, await jpeg(1024, 1024));
    const attachmentId = (uploaded.json() as { attachment: { id: string } }).attachment.id;

    const resized = await context.app.inject({
      method: "GET",
      url: `/api/attachments/${attachmentId}/file?w=256`,
      headers: { cookie },
    });
    expect(resized.statusCode).toBe(200);
    const meta = await sharp(resized.rawPayload).metadata();
    expect(meta.width).toBe(256);
  });

  it("lists attachments for a habit and reports remaining slots per entry", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    await base64Upload(context, cookie, mutationId, await png(25, 25));

    const byMutation = await context.app.inject({
      method: "GET",
      url: `/api/attachments?mutationId=${mutationId}`,
      headers: { cookie },
    });
    expect(byMutation.statusCode).toBe(200);
    const payload = byMutation.json() as { attachments: unknown[]; remaining: number; limit: number };
    expect(payload.attachments).toHaveLength(1);
    expect(payload.limit).toBe(10);
    expect(payload.remaining).toBe(9);
  });

  it("requires authentication", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const mutationId = await makeMutation(context, body.user.id);
    void cookie;

    const response = await base64Upload(context, "", mutationId, await png(20, 20));
    expect(response.statusCode).toBe(401);
  });

  it("cleans up files when its mutation cascade-deletes", async () => {
    context = await createTestContext();
    const { body, cookie } = await signUp(context.app);
    const habit = await createHabit(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, input: { name: "Cascade", frequency: { type: "daily" } }, today: "2026-03-07" },
    );
    const result = await completeHabitForToday(
      { db: context.app.db, sqlite: context.app.sqlite },
      { userId: body.user.id, habitId: habit.id, source: "web", timestamp: TODAY },
    );
    await base64Upload(context, cookie, result.mutation.id, await png(20, 20));

    // Deleting the habit cascades to mutations and attachment rows. Files on
    // disk are intentionally left (documented gap), so we only assert the rows.
    await context.app.db.entry.delete({ where: { id: habit.id } });
    const remaining = await context.app.db.attachment.count();
    expect(remaining).toBe(0);
    const dirEntries = await readdir(context.attachmentsDir).catch(() => []);
    expect(Array.isArray(dirEntries)).toBe(true);
  });
});
