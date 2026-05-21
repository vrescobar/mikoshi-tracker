import type { FastifyInstance } from "fastify";

import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  listEventsHandler,
  undoEventHandler,
  updateEventHandler,
} from "./event.controller";

export async function registerEventRoutes(app: FastifyInstance) {
  app.post("/api/entries/:id/events", createEventHandler);
  app.get("/api/events", listEventsHandler);
  app.get("/api/events/:eventId", getEventHandler);
  app.patch("/api/events/:eventId", updateEventHandler);
  app.delete("/api/events/:eventId", deleteEventHandler);
  app.post("/api/events/:eventId/undo", undoEventHandler);
}
