import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MUTATION,
  type AttachmentListResponse,
  type AttachmentMetadata,
} from "@mikoshi-tracker/contracts/attachments";

import type { PrismaClient } from "../../generated/prisma/client";

import {
  AttachmentFileMissingError,
  AttachmentLimitError,
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  MutationNotFoundError,
} from "./attachment.errors";
import { processUploadedImage } from "./attachment.image";
import {
  countAttachmentsForMutation,
  createAttachment,
  deleteAttachment,
  findLatestOwnedMutationForHabit,
  findOwnedAttachment,
  findOwnedMutation,
  listAttachmentsByHabit,
  listAttachmentsByMutation,
  type OwnedMutation,
  type PersistedAttachment,
} from "./attachment.repository";
import { buildStorageKey, deleteFile, fileExists, resolveStoragePath, writeFileAtomic } from "./attachment.storage";

export type AttachmentDependencies = {
  db: PrismaClient;
  attachmentsDir: string;
};

function buildAttachmentUrl(id: string): string {
  return `/api/attachments/${id}/file`;
}

export function serializeAttachment(attachment: PersistedAttachment): AttachmentMetadata {
  return {
    id: attachment.id,
    // External field is still named `mutationId`; it now carries the EventMutation id.
    mutationId: attachment.eventMutationId ?? "",
    kind: "image",
    mimeType: attachment.mimeType,
    size: attachment.size,
    width: attachment.width,
    height: attachment.height,
    originalName: attachment.originalName,
    createdAt: attachment.createdAt.toISOString(),
    url: buildAttachmentUrl(attachment.id),
  };
}

/**
 * Where to hang the attachment: a precise check-in entry (used by AI agents),
 * or a habit whose latest entry is resolved server-side (used by the web UI).
 */
export type AttachmentTarget = { mutationId: string } | { habitId: string };

async function resolveTarget(
  dependencies: AttachmentDependencies,
  userId: string,
  target: AttachmentTarget,
): Promise<OwnedMutation> {
  const mutation =
    "mutationId" in target
      ? await findOwnedMutation(dependencies.db, { userId, mutationId: target.mutationId })
      : await findLatestOwnedMutationForHabit(dependencies.db, { userId, habitId: target.habitId });

  if (!mutation) {
    throw new MutationNotFoundError();
  }

  return mutation;
}

/** Process and persist one image against an already-resolved entry. */
async function persistImage(
  dependencies: AttachmentDependencies,
  mutation: OwnedMutation,
  buffer: Buffer,
  originalName: string | null | undefined,
): Promise<AttachmentMetadata> {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(MAX_ATTACHMENT_BYTES);
  }

  const processed = await processUploadedImage(buffer);
  const storageKey = buildStorageKey(mutation.userId, mutation.id, processed.ext);
  const absolutePath = resolveStoragePath(dependencies.attachmentsDir, storageKey);

  await writeFileAtomic(absolutePath, processed.buffer);

  try {
    const created = await createAttachment(dependencies.db, {
      mutationId: mutation.id,
      userId: mutation.userId,
      kind: "image",
      storageKey,
      originalName: originalName?.trim() || null,
      mimeType: processed.mimeType,
      size: processed.buffer.length,
      width: processed.width,
      height: processed.height,
    });

    return serializeAttachment(created);
  } catch (error) {
    // The DB row never landed — do not leave an orphaned file behind.
    await deleteFile(absolutePath).catch(() => undefined);
    throw error;
  }
}

/** Upload a single image (used by the JSON/base64 endpoint for AI agents). */
export async function uploadAttachment(
  dependencies: AttachmentDependencies,
  params: {
    userId: string;
    target: AttachmentTarget;
    buffer: Buffer;
    originalName?: string | null;
  },
): Promise<AttachmentMetadata> {
  const mutation = await resolveTarget(dependencies, params.userId, params.target);
  const existingCount = await countAttachmentsForMutation(dependencies.db, mutation.id);

  if (existingCount >= MAX_ATTACHMENTS_PER_MUTATION) {
    throw new AttachmentLimitError(MAX_ATTACHMENTS_PER_MUTATION);
  }

  return persistImage(dependencies, mutation, params.buffer, params.originalName);
}

/**
 * Upload several images to one entry (used by the multipart endpoint for the
 * web). The per-entry limit is checked up front so a batch never lands
 * partially, then the refreshed entry listing is returned.
 */
export async function uploadAttachments(
  dependencies: AttachmentDependencies,
  params: {
    userId: string;
    target: AttachmentTarget;
    files: Array<{ buffer: Buffer; originalName?: string | null }>;
  },
): Promise<AttachmentListResponse> {
  const mutation = await resolveTarget(dependencies, params.userId, params.target);
  const existingCount = await countAttachmentsForMutation(dependencies.db, mutation.id);

  if (existingCount + params.files.length > MAX_ATTACHMENTS_PER_MUTATION) {
    throw new AttachmentLimitError(MAX_ATTACHMENTS_PER_MUTATION);
  }

  for (const file of params.files) {
    await persistImage(dependencies, mutation, file.buffer, file.originalName);
  }

  return listAttachments(dependencies, { userId: params.userId, mutationId: mutation.id });
}

export async function listAttachments(
  dependencies: AttachmentDependencies,
  params: { userId: string; mutationId?: string; habitId?: string },
): Promise<AttachmentListResponse> {
  if (params.mutationId) {
    const mutation = await findOwnedMutation(dependencies.db, {
      userId: params.userId,
      mutationId: params.mutationId,
    });

    if (!mutation) {
      throw new MutationNotFoundError();
    }

    const attachments = await listAttachmentsByMutation(dependencies.db, {
      userId: params.userId,
      mutationId: params.mutationId,
    });

    return {
      attachments: attachments.map(serializeAttachment),
      limit: MAX_ATTACHMENTS_PER_MUTATION,
      remaining: Math.max(0, MAX_ATTACHMENTS_PER_MUTATION - attachments.length),
    };
  }

  if (params.habitId) {
    const attachments = await listAttachmentsByHabit(dependencies.db, {
      userId: params.userId,
      habitId: params.habitId,
    });

    return {
      attachments: attachments.map(serializeAttachment),
      limit: MAX_ATTACHMENTS_PER_MUTATION,
      // Per-entry limits are only meaningful per mutation; for a habit-wide
      // listing the upload control re-queries by mutationId for the real value.
      remaining: MAX_ATTACHMENTS_PER_MUTATION,
    };
  }

  throw new Error("listAttachments requires mutationId or habitId");
}

export type AttachmentDownload = {
  attachment: PersistedAttachment;
  absolutePath: string;
};

export async function resolveAttachmentDownload(
  dependencies: AttachmentDependencies,
  params: { userId: string; id: string },
): Promise<AttachmentDownload> {
  const attachment = await findOwnedAttachment(dependencies.db, {
    userId: params.userId,
    id: params.id,
  });

  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  const absolutePath = resolveStoragePath(dependencies.attachmentsDir, attachment.storageKey);

  if (!(await fileExists(absolutePath))) {
    throw new AttachmentFileMissingError();
  }

  return { attachment, absolutePath };
}

export async function deleteAttachmentById(
  dependencies: AttachmentDependencies,
  params: { userId: string; id: string },
): Promise<void> {
  const attachment = await findOwnedAttachment(dependencies.db, {
    userId: params.userId,
    id: params.id,
  });

  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  const absolutePath = resolveStoragePath(dependencies.attachmentsDir, attachment.storageKey);

  await deleteAttachment(dependencies.db, attachment.id);
  // Best-effort: a missing file must not block removing the row.
  await deleteFile(absolutePath).catch(() => undefined);
}
