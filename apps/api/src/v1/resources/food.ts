import { z } from "zod";

import {
  foodDayQuerySchema,
  foodDayResponseSchema,
  foodRelogInputSchema,
  foodRelogResponseSchema,
  foodSearchQuerySchema,
  foodSearchResponseSchema,
} from "@mikoshi-tracker/contracts/food";

import { getRequestTimestamp, getRequestTimeZoneOverride } from "../../shared/controller-helpers";
import { getFoodDay, relogFood, searchFoods } from "../../modules/food/food.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const FoodSearchResponse = registerSchema("FoodSearchResponse", foodSearchResponseSchema);
const FoodRelogResponse = registerSchema("FoodRelogResponse", foodRelogResponseSchema);
const FoodDayResponse = registerSchema("FoodDayResponse", foodDayResponseSchema);

export function foodV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "food",
      path: "/food/day",
      operationId: "foodDay",
      summary: "The day's meals with provenance + photos, plus the nutrition roll-up",
      auth: "bearer",
      mutating: false,
      querySchema: foodDayQuerySchema,
      outputSchema: envelope(FoodDayResponse),
      handler: (ctx) => {
        const query = ctx.query as z.infer<typeof foodDayQuerySchema>;
        return getFoodDay(ctx.deps, {
          userId: requireUserId(ctx),
          date: query.date,
          timestamp: getRequestTimestamp(ctx.request),
          timeZone: getRequestTimeZoneOverride(ctx.request),
        });
      },
    },
    {
      method: "GET",
      resource: "food",
      path: "/food/search",
      operationId: "foodSearch",
      summary: "Fuzzy search the caller's saved food items and past meals",
      auth: "bearer",
      mutating: false,
      querySchema: foodSearchQuerySchema,
      outputSchema: envelope(FoodSearchResponse),
      handler: async (ctx) => {
        const query = ctx.query as z.infer<typeof foodSearchQuerySchema>;
        const results = await searchFoods(ctx.deps, {
          userId: requireUserId(ctx),
          q: query.q,
          limit: query.limit,
          sources: query.sources,
        });
        return { results };
      },
    },
    {
      method: "POST",
      resource: "food",
      path: "/food/relog",
      operationId: "foodRelog",
      summary: "Re-log a previous meal or saved item as a new meal",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: foodRelogInputSchema,
      outputSchema: envelope(FoodRelogResponse),
      handler: (ctx) =>
        relogFood(ctx.deps, {
          userId: requireUserId(ctx),
          input: ctx.input as z.infer<typeof foodRelogInputSchema>,
          timestamp: getRequestTimestamp(ctx.request),
        }),
    },
  ];
}
