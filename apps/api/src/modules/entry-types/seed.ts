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
    sources: { type: "array", items: { type: "string" }, nullable: true },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const FOOD_MEAL_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const FOOD_MEAL_AGGREGATIONS = JSON.stringify({
  metrics: ["sum", "count", "missing_days"],
  sumFields: ["kcal", "protein_g", "carbs_g", "fat_g"],
  cachedColumns: { kcal: "kcal_cached" },
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
];

export async function seedBuiltInEntryTypes(db: PrismaClient): Promise<void> {
  for (const type of BUILT_IN_ENTRY_TYPES) {
    await db.entryType.upsert({
      where: { slug: type.slug },
      create: type,
      // Keep the aggregations spec in sync so cachedColumns additions are picked up
      // on existing deployments without requiring a separate data migration.
      update: { aggregations: type.aggregations },
    });
  }
}
