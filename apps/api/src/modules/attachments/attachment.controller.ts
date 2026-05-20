import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ATTACHMENT_MAX_DIMENSION, attachmentUploadBase64InputSchema } from "@haaabit/contracts/attachments";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { sendAuthError } from "../../shared/controller-helpers";

import {
  AttachmentFileMissingError,
  AttachmentLimitError,
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  MissingUploadError,
  MutationNotFoundError,
  UnsupportedMediaTypeError,
} from "./attachment.errors";
import { renderResized } from "./attachment.image";
import {
  deleteAttachmentById,
  listAttachments,
  resolveAttachmentDownload,
  uploadAttachment,
  uploadAttachments,
  type AttachmentDependencies,
} from "./attachment.service";
import { openFileStream } from "./attachment.storage";

function dependencies(request: FastifyRequest): AttachmentDependencies {
  return {
    db: request.server.db,
    attachmentsDir: request.server.env.ATTACHMENTS_DIR,
  };
}

function isFileTooLargeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function sendAttachmentError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid attachment payload",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof MissingUploadError) {
    reply.status(400).send({ code: "BAD_REQUEST", message: error.message });
    return reply;
  }

  if (error instanceof MutationNotFoundError || error instanceof AttachmentNotFoundError) {
    reply.status(404).send({ code: "NOT_FOUND", message: error.message });
    return reply;
  }

  if (error instanceof AttachmentFileMissingError) {
    reply.status(404).send({ code: "ATTACHMENT_FILE_MISSING", message: error.message });
    return reply;
  }

  if (error instanceof AttachmentLimitError) {
    reply.status(409).send({ code: "ATTACHMENT_LIMIT_REACHED", message: error.message });
    return reply;
  }

  if (error instanceof UnsupportedMediaTypeError) {
    reply.status(415).send({ code: "UNSUPPORTED_MEDIA_TYPE", message: error.message });
    return reply;
  }

  if (error instanceof AttachmentTooLargeError || isFileTooLargeError(error)) {
    reply.status(413).send({
      code: "ATTACHMENT_TOO_LARGE",
      message: error instanceof AttachmentTooLargeError ? error.message : "File exceeds the maximum allowed size",
    });
    return reply;
  }

  throw error;
}

/** POST /api/attachments — multipart upload of one or more images (web). */
export async function uploadAttachmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);

    if (!request.isMultipart()) {
      throw new MissingUploadError();
    }

    let mutationId: string | undefined;
    let habitId: string | undefined;
    const files: Array<{ buffer: Buffer; filename: string | undefined }> = [];

    for await (const part of request.parts()) {
      if (part.type === "file") {
        files.push({ buffer: await part.toBuffer(), filename: part.filename });
      } else if (part.fieldname === "mutationId" && typeof part.value === "string") {
        mutationId = part.value;
      } else if (part.fieldname === "habitId" && typeof part.value === "string") {
        habitId = part.value;
      }
    }

    const target =
      mutationId && mutationId.trim().length > 0
        ? { mutationId }
        : habitId && habitId.trim().length > 0
          ? { habitId }
          : null;

    if (!target) {
      reply.status(400).send({ code: "BAD_REQUEST", message: "mutationId or habitId is required" });
      return;
    }

    if (files.length === 0) {
      throw new MissingUploadError();
    }

    return await uploadAttachments(dependencies(request), {
      userId: user.id,
      target,
      files: files.map((file) => ({ buffer: file.buffer, originalName: file.filename ?? null })),
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAttachmentError(reply, error);
  }
}

/** POST /api/attachments/base64 — JSON upload for MCP/OpenClaw agents. */
export async function uploadAttachmentBase64Handler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const input = attachmentUploadBase64InputSchema.parse(request.body);
    // Tolerate a data-URL prefix (data:image/png;base64,....).
    const base64 = input.data.includes(",") ? input.data.slice(input.data.indexOf(",") + 1) : input.data;
    const buffer = Buffer.from(base64, "base64");

    const attachment = await uploadAttachment(dependencies(request), {
      userId: user.id,
      target: { mutationId: input.mutationId },
      buffer,
      originalName: input.originalName ?? null,
    });

    return { attachment };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAttachmentError(reply, error);
  }
}

/** GET /api/attachments?mutationId=|habitId= — list attachment metadata. */
export async function listAttachmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const query = (request.query ?? {}) as { mutationId?: string; habitId?: string };

    if (!query.mutationId && !query.habitId) {
      reply.status(400).send({ code: "BAD_REQUEST", message: "Provide mutationId or habitId" });
      return;
    }

    return await listAttachments(dependencies(request), {
      userId: user.id,
      mutationId: query.mutationId,
      habitId: query.habitId,
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAttachmentError(reply, error);
  }
}

/** GET /api/attachments/:id/file — stream the binary (optionally downscaled). */
export async function downloadAttachmentHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = request.params as { id: string };
    const { attachment, absolutePath } = await resolveAttachmentDownload(dependencies(request), {
      userId: user.id,
      id,
    });

    const widthParam = (request.query as { w?: string } | undefined)?.w;
    const requestedWidth = widthParam ? Number.parseInt(widthParam, 10) : NaN;
    const wantsResize =
      Number.isInteger(requestedWidth) &&
      requestedWidth > 0 &&
      requestedWidth <= ATTACHMENT_MAX_DIMENSION &&
      attachment.mimeType !== "image/gif";

    reply.header("Cache-Control", "private, max-age=31536000, immutable");

    if (wantsResize) {
      const { readFile } = await import("node:fs/promises");
      const resized = await renderResized(await readFile(absolutePath), requestedWidth);
      reply.type(attachment.mimeType);
      reply.send(resized);
      return;
    }

    reply.type(attachment.mimeType);
    reply.header("Content-Length", attachment.size);
    reply.send(openFileStream(absolutePath));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAttachmentError(reply, error);
  }
}

/** DELETE /api/attachments/:id — remove an attachment (row + file). */
export async function deleteAttachmentHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = request.params as { id: string };

    await deleteAttachmentById(dependencies(request), { userId: user.id, id });

    reply.status(204).send();
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAttachmentError(reply, error);
  }
}
