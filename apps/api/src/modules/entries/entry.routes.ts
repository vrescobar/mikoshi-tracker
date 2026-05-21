import type { FastifyInstance } from "fastify";

import {
  archiveEntryHandler,
  createEntryHandler,
  getEntryHandler,
  listEntriesHandler,
  restoreEntryHandler,
  updateEntryHandler,
} from "./entry.controller";

export async function registerEntryRoutes(app: FastifyInstance) {
  app.get("/api/entries", listEntriesHandler);
  app.post("/api/entries", createEntryHandler);
  app.get("/api/entries/:id", getEntryHandler);
  app.patch("/api/entries/:id", updateEntryHandler);
  app.post("/api/entries/:id/archive", archiveEntryHandler);
  app.post("/api/entries/:id/restore", restoreEntryHandler);
}
