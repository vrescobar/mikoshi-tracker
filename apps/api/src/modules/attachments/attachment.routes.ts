import type { FastifyInstance } from "fastify";

import {
  deleteAttachmentHandler,
  downloadAttachmentHandler,
  listAttachmentsHandler,
  uploadAttachmentBase64Handler,
  uploadAttachmentsHandler,
} from "./attachment.controller";

/** Body limit for the base64 upload route: a 10 MB image is ~13.3 MB encoded. */
const BASE64_BODY_LIMIT = 20 * 1024 * 1024;

export async function registerAttachmentRoutes(app: FastifyInstance) {
  app.post("/api/attachments", uploadAttachmentsHandler);
  app.post("/api/attachments/base64", { bodyLimit: BASE64_BODY_LIMIT }, uploadAttachmentBase64Handler);
  app.get("/api/attachments", listAttachmentsHandler);
  app.get("/api/attachments/:id/file", downloadAttachmentHandler);
  app.delete("/api/attachments/:id", deleteAttachmentHandler);
}
