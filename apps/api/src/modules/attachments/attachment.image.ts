import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { ATTACHMENT_MAX_DIMENSION } from "@mikoshi-tracker/contracts/attachments";

import { UnsupportedMediaTypeError } from "./attachment.errors";

/**
 * MIME types accepted on upload, mapped to the format the file is *stored* as.
 * HEIC/HEIF/AVIF are transcoded to JPEG so every browser can render them and
 * so the stored bytes never depend on libheif being present at read time.
 */
const ACCEPTED_TYPES: Record<string, { storedMime: string; ext: string; transcodeToJpeg: boolean }> = {
  "image/jpeg": { storedMime: "image/jpeg", ext: "jpg", transcodeToJpeg: false },
  "image/png": { storedMime: "image/png", ext: "png", transcodeToJpeg: false },
  "image/webp": { storedMime: "image/webp", ext: "webp", transcodeToJpeg: false },
  "image/gif": { storedMime: "image/gif", ext: "gif", transcodeToJpeg: false },
  "image/heic": { storedMime: "image/jpeg", ext: "jpg", transcodeToJpeg: true },
  "image/heif": { storedMime: "image/jpeg", ext: "jpg", transcodeToJpeg: true },
  "image/avif": { storedMime: "image/jpeg", ext: "jpg", transcodeToJpeg: true },
};

export type ProcessedImage = {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  width: number | null;
  height: number | null;
};

/**
 * Validate and normalize an uploaded image:
 * - the type is detected from magic bytes, never the client-provided header;
 * - non-images are rejected;
 * - the image is downscaled so its longest side is <= ATTACHMENT_MAX_DIMENSION
 *   (aspect ratio preserved, never upscaled);
 * - HEIC/HEIF/AVIF are transcoded to JPEG.
 */
export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  const detected = await fileTypeFromBuffer(input);
  const accepted = detected ? ACCEPTED_TYPES[detected.mime] : undefined;

  if (!detected || !accepted) {
    throw new UnsupportedMediaTypeError(detected?.mime ?? null);
  }

  const isGif = detected.mime === "image/gif";
  // `animated` keeps every frame of a GIF instead of flattening to the first.
  let pipeline = sharp(input, isGif ? { animated: true } : {})
    .rotate()
    .resize({
      width: ATTACHMENT_MAX_DIMENSION,
      height: ATTACHMENT_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (accepted.transcodeToJpeg) {
    pipeline = pipeline.jpeg({ quality: 82 });
  }

  const buffer = await pipeline.toBuffer();
  const metadata = await sharp(buffer).metadata();

  return {
    buffer,
    mimeType: accepted.storedMime,
    ext: accepted.ext,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

/**
 * Re-render a stored image at a smaller bound. Used to serve a lighter copy to
 * LLM agents so a full-resolution photo does not bloat the model context.
 */
export async function renderResized(input: Buffer, maxDimension: number): Promise<Buffer> {
  return sharp(input)
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .toBuffer();
}
