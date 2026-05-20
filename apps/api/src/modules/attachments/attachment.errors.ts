/** Raised when an entry already holds the maximum number of attachments. */
export class AttachmentLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`This entry already has the maximum of ${limit} attachments`);
    this.name = "AttachmentLimitError";
  }
}

/** Raised when the uploaded bytes are not an accepted image type. */
export class UnsupportedMediaTypeError extends Error {
  constructor(detectedType: string | null) {
    super(
      detectedType
        ? `Unsupported file type: ${detectedType}. Only images are accepted.`
        : "Unsupported or unrecognized file type. Only images are accepted.",
    );
    this.name = "UnsupportedMediaTypeError";
  }
}

/** Raised when the attachment row does not exist or is not owned by the caller. */
export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Attachment not found");
    this.name = "AttachmentNotFoundError";
  }
}

/** Raised when the row exists but the backing file is gone from disk. */
export class AttachmentFileMissingError extends Error {
  constructor() {
    super("Attachment file is no longer available");
    this.name = "AttachmentFileMissingError";
  }
}

/** Raised when no file part was supplied in a multipart upload. */
export class MissingUploadError extends Error {
  constructor() {
    super("No file was provided in the upload");
    this.name = "MissingUploadError";
  }
}

/** Raised when the uploaded file exceeds the per-file size limit. */
export class AttachmentTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`File exceeds the maximum size of ${maxBytes} bytes`);
    this.name = "AttachmentTooLargeError";
  }
}

/** Raised when the target check-in entry does not exist or is not owned. */
export class MutationNotFoundError extends Error {
  constructor() {
    super("Check-in entry not found");
    this.name = "MutationNotFoundError";
  }
}
