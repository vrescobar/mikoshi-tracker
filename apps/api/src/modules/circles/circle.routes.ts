import type { FastifyInstance } from "fastify";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import {
  addCircleMemberHandler,
  circleCompleteHabitHandler,
  circleSetHabitTotalHandler,
  circleUndoHabitHandler,
  createCircleHandler,
  createCircleTokenHandler,
  getCircleDetailHandler,
  getCircleLeaderboardHandler,
  getMemberHabitsHandler,
  listCircleMembersHandler,
  listCirclesHandler,
  listCircleTokensHandler,
  removeCircleMemberHandler,
  revokeCircleTokenHandler,
  shareHabitHandler,
  unshareHabitHandler,
  updateCircleMemberHandler,
} from "./circle.controller";

// Populated in task 16 (OpenAPI + docs)
export const circleApiRouteDefinitions: PublicApiRouteDefinition[] = [];

export async function registerCircleRoutes(app: FastifyInstance) {
  // ── Circle-token-authenticated routes ──────────────────────────────────────
  app.get("/api/circles/:circleId/members", listCircleMembersHandler);
  app.get("/api/circles/:circleId/leaderboard", getCircleLeaderboardHandler);
  app.get("/api/circles/:circleId/members/:userId/habits", getMemberHabitsHandler);
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/complete",
    circleCompleteHabitHandler,
  );
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/set-total",
    circleSetHabitTotalHandler,
  );
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/undo",
    circleUndoHabitHandler,
  );

  // ── Session-authenticated management routes ───────────────────────────────
  app.post("/api/circles", createCircleHandler);
  app.get("/api/circles", listCirclesHandler);
  app.get("/api/circles/:circleId", getCircleDetailHandler);
  app.post("/api/circles/:circleId/members", addCircleMemberHandler);
  app.patch("/api/circles/:circleId/members/:membershipId", updateCircleMemberHandler);
  app.delete("/api/circles/:circleId/members/:membershipId", removeCircleMemberHandler);
  app.post("/api/circles/:circleId/shares", shareHabitHandler);
  app.delete("/api/circles/:circleId/shares/:habitId", unshareHabitHandler);
  app.post("/api/circles/:circleId/tokens", createCircleTokenHandler);
  app.get("/api/circles/:circleId/tokens", listCircleTokensHandler);
  app.delete("/api/circles/:circleId/tokens/:tokenId", revokeCircleTokenHandler);
}
