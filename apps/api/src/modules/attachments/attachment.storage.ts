import { randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Build the relative storage key for a new attachment. The filename is a fresh
 * random id (never the client-provided name) so uploads cannot collide or
 * smuggle path separators.
 */
export function buildStorageKey(userId: string, mutationId: string, ext: string): string {
  return join(userId, mutationId, `${randomUUID()}.${ext}`);
}

/**
 * Resolve a storage key against the attachments root, refusing any key that
 * escapes the root (defence-in-depth against path traversal).
 */
export function resolveStoragePath(root: string, storageKey: string): string {
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, storageKey);

  if (target !== rootAbs && !target.startsWith(rootAbs + sep)) {
    throw new Error(`Storage key escapes the attachments root: ${storageKey}`);
  }

  return target;
}

/** Write bytes atomically: write to a temp file, then rename into place. */
export async function writeFileAtomic(absolutePath: string, data: Buffer): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, absolutePath);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export function openFileStream(absolutePath: string): ReadStream {
  return createReadStream(absolutePath);
}

/** Best-effort delete: a missing file is treated as success. */
export async function deleteFile(absolutePath: string): Promise<void> {
  await rm(absolutePath, { force: true });
}
