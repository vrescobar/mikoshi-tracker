import type { PrismaClient } from "../../generated/prisma/client";

const HABIT_BOOLEAN_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["completed"],
  properties: {
    completed: { type: "boolean" },
  },
  additionalProperties: false,
});

const HABIT_BOOLEAN_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  required: ["frequencyType"],
  properties: {
    frequencyType: {
      type: "string",
      enum: ["DAILY", "WEEKDAYS", "WEEKLY_COUNT", "MONTHLY_COUNT"],
    },
    frequencyCount: { type: "integer", minimum: 1, nullable: true },
  },
  additionalProperties: false,
});

const HABIT_BOOLEAN_AGGREGATIONS = JSON.stringify({
  metrics: ["completion_rate", "streak"],
  windows: ["7d", "30d"],
});

const HABIT_QUANTITY_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["value", "completed"],
  properties: {
    value: { type: "number", minimum: 0 },
    completed: { type: "boolean" },
  },
  additionalProperties: false,
});

const HABIT_QUANTITY_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  required: ["frequencyType", "targetValue"],
  properties: {
    frequencyType: {
      type: "string",
      enum: ["DAILY", "WEEKDAYS", "WEEKLY_COUNT", "MONTHLY_COUNT"],
    },
    frequencyCount: { type: "integer", minimum: 1, nullable: true },
    targetValue: { type: "number", minimum: 0 },
    unit: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const HABIT_QUANTITY_AGGREGATIONS = JSON.stringify({
  metrics: ["completion_rate", "streak", "sum"],
  sumFields: ["value"],
  groupBy: ["day", "week", "month"],
});

const FOOD_MEAL_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["name", "kcal", "protein_g", "carbs_g", "fat_g", "source", "confidence"],
  properties: {
    name: { type: "string", minLength: 1 },
    kcal: { type: "number", minimum: 0 },
    protein_g: { type: "number", minimum: 0 },
    carbs_g: { type: "number", minimum: 0 },
    fat_g: { type: "number", minimum: 0 },
    fiber_g: { type: "number", minimum: 0, nullable: true },
    sugar_g: { type: "number", minimum: 0, nullable: true },
    portion_g: { type: "number", minimum: 0, nullable: true },
    mealSlot: {
      type: "string",
      enum: ["breakfast", "lunch", "snack", "dinner", "other"],
      nullable: true,
    },
    source: {
      type: "string",
      enum: ["label", "similar_to_event", "web_lookup", "vision_only", "manual"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    similarToEventId: { type: "string", nullable: true },
    // Epic B: optional back-reference to the saved food_item this meal was
    // logged from (one-tap re-log). Additive + optional, so existing food_meal
    // events stay valid under the strict object.
    fromFoodItemId: { type: "string", nullable: true },
    sources: { type: "array", items: { type: "string" }, nullable: true },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const FOOD_MEAL_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    // Phase 13 G-DASH-3: optional daily kcal target used by the Today
    // unified strip on the dashboard. Additive; existing Entry.config rows
    // remain valid because the field is optional.
    dailyKcalTarget: { type: "number", minimum: 1, nullable: true },
  },
  additionalProperties: false,
});

const FOOD_MEAL_AGGREGATIONS = JSON.stringify({
  metrics: ["sum", "count", "missing_days"],
  sumFields: ["kcal", "protein_g", "carbs_g", "fat_g"],
  cachedColumns: { kcal: "kcal_cached" },
});

const WEIGHT_LOG_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["weight_kg"],
  properties: {
    weight_kg: { type: "number", minimum: 0 },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const WEIGHT_LOG_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    targetWeightKg: { type: "number", minimum: 1, nullable: true },
  },
  additionalProperties: false,
});

const WEIGHT_LOG_AGGREGATIONS = JSON.stringify({
  metrics: ["avg", "missing_days"],
  sumFields: ["weight_kg"],
  cachedColumns: {},
});

// Temptation journal: an event-log for cravings/urges behind a negative habit
// ("días sin fumar", resisting tentations). The negative habit itself is just a
// habit_boolean "stayed clean today" (its streak leaderboard already ranks the
// longest clean runs); this type captures WHEN/WHY urges happened and whether
// they were resisted, so it powers reflection + "most resisted" metric contests.
const TEMPTATION_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["intensity", "resisted"],
  properties: {
    intensity: { type: "integer", minimum: 1, maximum: 5 },
    resisted: { type: "boolean" },
    resistedValue: { type: "integer", minimum: 0, maximum: 1, nullable: true },
    trigger: { type: "string", nullable: true },
    note: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const TEMPTATION_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    /// Optional label of the habit this journal supports (free-form, e.g. "smoking").
    habitLabel: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const TEMPTATION_AGGREGATIONS = JSON.stringify({
  metrics: ["count", "sum"],
  // intensity → total urge strength faced; resistedValue (0/1) → # resisted, so a
  // metric contest can score "most temptations resisted" via cumulative sum.
  sumFields: ["intensity", "resistedValue"],
  groupBy: ["day", "week", "month"],
});

// ─── Diet goal (Epic B) ─────────────────────────────────────────────────────
// History-aware event_log: each goal change is a dated event, so the engine
// gives us a free audit trail of how a user's targets evolved. The ACTIVE goal
// is simply the latest non-deleted event (resolved with a single query, not an
// aggregation). Per-meal-slot targets are fixed fields because the JSON-Schema
// → Zod compiler does not support arbitrary-keyed maps.
const DIET_GOAL_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["kcalTarget"],
  properties: {
    kcalTarget: { type: "number", minimum: 1 },
    proteinTargetG: { type: "number", minimum: 0, nullable: true },
    carbsTargetG: { type: "number", minimum: 0, nullable: true },
    fatTargetG: { type: "number", minimum: 0, nullable: true },
    macroMode: { type: "string", enum: ["grams", "percent"], nullable: true },
    proteinPct: { type: "number", minimum: 0, maximum: 100, nullable: true },
    carbsPct: { type: "number", minimum: 0, maximum: 100, nullable: true },
    fatPct: { type: "number", minimum: 0, maximum: 100, nullable: true },
    breakfastKcal: { type: "number", minimum: 0, nullable: true },
    lunchKcal: { type: "number", minimum: 0, nullable: true },
    dinnerKcal: { type: "number", minimum: 0, nullable: true },
    snackKcal: { type: "number", minimum: 0, nullable: true },
    objective: { type: "string", enum: ["lose", "maintain", "gain"], nullable: true },
    linkedWeightGoalKg: { type: "number", minimum: 1, nullable: true },
    effectiveFrom: { type: "string", nullable: true },
    source: { type: "string", enum: ["manual", "ai", "computed"], nullable: true },
    confidence: { type: "number", minimum: 0, maximum: 1, nullable: true },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const DIET_GOAL_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const DIET_GOAL_AGGREGATIONS = JSON.stringify({
  metrics: ["count"],
  sumFields: [],
});

// ─── Food item / recipe library (Epic B) ────────────────────────────────────
// A reusable abstract food or recipe a user saves once and re-logs many times.
// Uses event_log cadence — persistEvent treats it as an event log, so each
// save is an event and edits keep the immutable audit trail. Macros are per
// `defaultPortionG`.
const FOOD_ITEM_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["name", "kcal", "protein_g", "carbs_g", "fat_g"],
  properties: {
    name: { type: "string", minLength: 1 },
    aliases: { type: "array", items: { type: "string" }, nullable: true },
    defaultPortionG: { type: "number", minimum: 0, nullable: true },
    kcal: { type: "number", minimum: 0 },
    protein_g: { type: "number", minimum: 0 },
    carbs_g: { type: "number", minimum: 0 },
    fat_g: { type: "number", minimum: 0 },
    fiber_g: { type: "number", minimum: 0, nullable: true },
    sugar_g: { type: "number", minimum: 0, nullable: true },
    isRecipe: { type: "boolean", nullable: true },
    ingredients: {
      type: "array",
      nullable: true,
      items: {
        type: "object",
        required: ["foodItemEventId", "amountG"],
        properties: {
          foodItemEventId: { type: "string", minLength: 1 },
          amountG: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    },
    source: {
      type: "string",
      enum: ["label", "web_lookup", "vision_only", "manual", "ai"],
      nullable: true,
    },
    confidence: { type: "number", minimum: 0, maximum: 1, nullable: true },
    sources: { type: "array", items: { type: "string" }, nullable: true },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const FOOD_ITEM_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const FOOD_ITEM_AGGREGATIONS = JSON.stringify({
  metrics: ["count"],
  sumFields: [],
});

// ─── Diet preferences (Epic B) ──────────────────────────────────────────────
// A per-user singleton: one diet_prefs Entry whose `config` holds the user's
// dietary preferences. Edited through the existing PATCH /api/entries/:id path;
// events are unused (the payload schema stays minimal). The food skill reads
// these to tune estimation (default slot, allergy warnings, units).
const DIET_PREFS_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    note: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const DIET_PREFS_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    dietStyle: { type: "string", nullable: true },
    allergies: { type: "array", items: { type: "string" }, nullable: true },
    dislikes: { type: "array", items: { type: "string" }, nullable: true },
    defaultMealSlot: {
      type: "string",
      enum: ["breakfast", "lunch", "snack", "dinner", "other"],
      nullable: true,
    },
    units: { type: "string", enum: ["metric", "imperial"], nullable: true },
  },
  additionalProperties: false,
});

const DIET_PREFS_AGGREGATIONS = JSON.stringify({
  metrics: [],
  sumFields: [],
});

const BUILT_IN_ENTRY_TYPES: Array<{
  slug: string;
  displayName: string;
  cadence: string;
  payloadSchema: string;
  configSchema: string;
  aggregations: string;
  skillSlug: string | null;
  isBuiltIn: boolean;
}> = [
  {
    slug: "habit_boolean",
    displayName: "entry_type.habit_boolean",
    cadence: "recurring",
    payloadSchema: HABIT_BOOLEAN_PAYLOAD_SCHEMA,
    configSchema: HABIT_BOOLEAN_CONFIG_SCHEMA,
    aggregations: HABIT_BOOLEAN_AGGREGATIONS,
    skillSlug: null,
    isBuiltIn: true,
  },
  {
    slug: "habit_quantity",
    displayName: "entry_type.habit_quantity",
    cadence: "recurring",
    payloadSchema: HABIT_QUANTITY_PAYLOAD_SCHEMA,
    configSchema: HABIT_QUANTITY_CONFIG_SCHEMA,
    aggregations: HABIT_QUANTITY_AGGREGATIONS,
    skillSlug: null,
    isBuiltIn: true,
  },
  {
    slug: "food_meal",
    displayName: "entry_type.food_meal",
    cadence: "event_log",
    payloadSchema: FOOD_MEAL_PAYLOAD_SCHEMA,
    configSchema: FOOD_MEAL_CONFIG_SCHEMA,
    aggregations: FOOD_MEAL_AGGREGATIONS,
    skillSlug: "mikoshi-tracker-food",
    isBuiltIn: true,
  },
  {
    slug: "weight_log",
    displayName: "entry_type.weight_log",
    cadence: "event_log",
    payloadSchema: WEIGHT_LOG_PAYLOAD_SCHEMA,
    configSchema: WEIGHT_LOG_CONFIG_SCHEMA,
    aggregations: WEIGHT_LOG_AGGREGATIONS,
    skillSlug: null,
    isBuiltIn: true,
  },
  {
    slug: "temptation",
    displayName: "entry_type.temptation",
    cadence: "event_log",
    payloadSchema: TEMPTATION_PAYLOAD_SCHEMA,
    configSchema: TEMPTATION_CONFIG_SCHEMA,
    aggregations: TEMPTATION_AGGREGATIONS,
    skillSlug: null,
    isBuiltIn: true,
  },
  {
    slug: "diet_goal",
    displayName: "entry_type.diet_goal",
    cadence: "event_log",
    payloadSchema: DIET_GOAL_PAYLOAD_SCHEMA,
    configSchema: DIET_GOAL_CONFIG_SCHEMA,
    aggregations: DIET_GOAL_AGGREGATIONS,
    skillSlug: "mikoshi-tracker-food",
    isBuiltIn: true,
  },
  {
    slug: "food_item",
    displayName: "entry_type.food_item",
    // event_log (not a bespoke "library" cadence) so it stays within the
    // recurring|event_log contract enum. persistEvent treats it as an event
    // log; the reusable-library semantic is carried by the slug + food skill.
    cadence: "event_log",
    payloadSchema: FOOD_ITEM_PAYLOAD_SCHEMA,
    configSchema: FOOD_ITEM_CONFIG_SCHEMA,
    aggregations: FOOD_ITEM_AGGREGATIONS,
    skillSlug: "mikoshi-tracker-food",
    isBuiltIn: true,
  },
  {
    slug: "diet_prefs",
    displayName: "entry_type.diet_prefs",
    cadence: "event_log",
    payloadSchema: DIET_PREFS_PAYLOAD_SCHEMA,
    configSchema: DIET_PREFS_CONFIG_SCHEMA,
    aggregations: DIET_PREFS_AGGREGATIONS,
    skillSlug: "mikoshi-tracker-food",
    isBuiltIn: true,
  },
];

export async function seedBuiltInEntryTypes(db: PrismaClient): Promise<void> {
  for (const type of BUILT_IN_ENTRY_TYPES) {
    await db.entryType.upsert({
      where: { slug: type.slug },
      create: type,
      // Keep the aggregations spec + configSchema in sync so additive schema
      // changes (e.g. food_meal.dailyKcalTarget) are picked up on existing
      // deployments without requiring a separate data migration.
      update: { aggregations: type.aggregations, configSchema: type.configSchema },
    });
  }
}
