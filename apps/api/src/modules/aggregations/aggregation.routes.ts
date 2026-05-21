import type { FastifyInstance } from "fastify";

import { getAggregationsHandler } from "./aggregation.controller";

export async function registerAggregationRoutes(app: FastifyInstance) {
  app.get("/api/aggregations", getAggregationsHandler);
}
