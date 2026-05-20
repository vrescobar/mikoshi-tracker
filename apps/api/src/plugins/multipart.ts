import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

import { MAX_ATTACHMENT_BYTES } from "@haaabit/contracts/attachments";

/**
 * Register multipart/form-data parsing for attachment uploads. The per-file
 * size limit is enforced here; oversize files surface as FST_REQ_FILE_TOO_LARGE.
 */
export async function registerMultipart(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_ATTACHMENT_BYTES,
      files: 10,
    },
  });
}
