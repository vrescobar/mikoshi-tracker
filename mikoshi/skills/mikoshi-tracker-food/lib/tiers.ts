/**
 * mikoshi-tracker-food — main pipeline orchestrator.
 *
 * Implements the Tier 0–4 + manual pipeline from GOAL.md §G6:
 *   Tier 0 — classify input (label | dish | package | text_only)
 *   Tier 1 — OCR nutrition label image (confidence ≤ 0.95)
 *   Tier 2 — similar_to_event: match against recent history (confidence ≤ 0.90)
 *   Tier 3 — web_lookup: Brave Search + Claude reconcile (confidence ≤ 0.70)
 *   Tier 4 — vision_only: estimate from photo (confidence ≤ 0.55)
 *   Manual  — user-provided values (confidence = 1.0)
 *
 * run.ts is a thin stdin/stdout shim around runFoodSkill().
 */

import {
  ensureFoodEntry,
  postFoodEvent,
  queryFoodEvents,
  patchFoodEvent,
  deleteFoodEvent,
  type FoodApiEnv,
  type FoodPayload,
  type FoodEventItem,
} from "./api-client.js";
import { getRecentFoodEvents, type RecentFoodEvent } from "./history.js";
import { analyzeImageForFood } from "./vision.js";
import { ocrNutritionLabel } from "./ocr.js";
import { searchAndReconcileNutrition } from "./web-search.js";
import {
  needsConfirmation,
  buildConfirmationMessage,
  type FoodMealSource,
  type ProposedPayload,
} from "./confirm.js";
import { callLlmProxy, safeParseJsonObject, type LlmProxyEnv } from "./llm.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallerInfo {
  identityId?: string;
  jid?: string;
  displayName?: string;
}

export interface FoodLogInput {
  /** Free-text description of the food */
  input?: string;
  /** Base64-encoded image */
  image_base64?: string;
  /** MIME type of the image, e.g. "image/jpeg" */
  image_mime_type?: string;
  /** If true, register directly with the provided nutritional values */
  manual?: boolean;
  /** Manual/confirmed payload fields */
  name?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  meal_slot?: string;
  notes?: string;
  /** ISO 8601 datetime (default: now) */
  occurred_at?: string;
}

export interface FoodQueryInput {
  from: string;
  to: string;
  limit?: number;
}

export interface FoodEditInput {
  event_id: string;
  name?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  meal_slot?: string;
  notes?: string;
}

export interface FoodDeleteInput {
  event_id: string;
}

export type FoodSkillInput = FoodLogInput | FoodQueryInput | FoodEditInput | FoodDeleteInput;

export interface FoodEnvelope {
  tool: string;
  input: Record<string, unknown>;
  workspaceDir?: string;
  caller?: CallerInfo;
}

export interface FoodEnv extends FoodApiEnv, LlmProxyEnv {
  BRAVE_SEARCH_API_KEY?: string;
}

export type FoodResult =
  | { status: "succeeded"; output: unknown }
  | { status: "failed"; error: string };

// ---------------------------------------------------------------------------
// Text helper (used by Tier 0 + Tier 2) — proxies to mikoshi's tier chain.
// ---------------------------------------------------------------------------

async function callTextProxy(
  env: LlmProxyEnv,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  return callLlmProxy(env, {
    taskKey: "skill.text",
    prompt,
    maxTokens,
  });
}

const safeParseJson = safeParseJsonObject;

// ---------------------------------------------------------------------------
// Tier 0 — classification
// ---------------------------------------------------------------------------

type InputClassification = "label" | "dish" | "package" | "text_only";

interface Tier0Result {
  classification: InputClassification;
  food_name: string;
  meal_slot: string | null;
  notes: string | null;
}

async function tier0Classify(
  textInput: string,
  hasImage: boolean,
  env: LlmProxyEnv,
): Promise<Tier0Result> {
  const imageNote = hasImage
    ? "The user also attached an image."
    : "No image was provided.";

  const prompt = `Classify this food input and extract key information.
User input: "${textInput}"
${imageNote}

Respond with ONLY a JSON object, no markdown:
{
  "classification": "label" | "dish" | "package" | "text_only",
  "food_name": "<extracted food name in Spanish, as specific as possible>",
  "meal_slot": "breakfast" | "lunch" | "snack" | "dinner" | "other" | null,
  "notes": "<any useful notes about portion/preparation, or null>"
}

Classification guide:
- "label": the image shows a nutrition/ingredient label
- "package": the user is describing a commercial packaged product by name
- "dish": the user is describing a cooked dish, restaurant meal, or homemade food
- "text_only": the user described food in text with no usable image`;

  const raw = await callTextProxy(env, prompt, 256);

  const parsed = safeParseJson(raw) as Tier0Result | null;
  return {
    classification: (parsed?.classification as InputClassification) ?? (hasImage ? "dish" : "text_only"),
    food_name: parsed?.food_name ?? textInput,
    meal_slot: parsed?.meal_slot ?? null,
    notes: parsed?.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tier 2 — similar_to_event
// ---------------------------------------------------------------------------

interface SimilarityResult {
  matched: true;
  eventId: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: number;
}

interface SimilarityMiss {
  matched: false;
}

async function tier2SimilarityCheck(
  foodName: string,
  recentEvents: RecentFoodEvent[],
  env: LlmProxyEnv,
): Promise<SimilarityResult | SimilarityMiss> {
  if (recentEvents.length === 0) return { matched: false };

  const list = recentEvents
    .slice(0, 30)
    .map((e, i) => `${i + 1}. "${e.name}" (${Math.round(e.kcal)} kcal) [id:${e.id}]`)
    .join("\n");

  const prompt = `I need to log: "${foodName}"

Recent food events logged by the user (last 30 days):
${list}

Does "${foodName}" match any of these entries exactly or very closely (same food, similar portion)?
If yes, respond with the event id. If no, respond with "none".
Respond with ONLY the event id (e.g. "cm123abc") or the word "none".`;

  const raw = await callTextProxy(env, prompt, 64);

  const answer = raw.trim().replace(/["']/g, "");
  if (answer === "none" || answer.length === 0) return { matched: false };

  // Find the matched event
  const matched = recentEvents.find((e) => e.id === answer);
  if (!matched) return { matched: false };

  return {
    matched: true,
    eventId: matched.id,
    name: matched.name,
    kcal: matched.kcal,
    protein_g: matched.protein_g,
    carbs_g: matched.carbs_g,
    fat_g: matched.fat_g,
    fiber_g: null,
    confidence: 0.9,
  };
}

// ---------------------------------------------------------------------------
// Main tier pipeline
// ---------------------------------------------------------------------------

interface PipelineSuccess {
  ok: true;
  payload: FoodPayload;
  tier: number;
}

interface PipelineFailure {
  ok: false;
  error: string;
}

async function runTierPipeline(
  textInput: string,
  hasImage: boolean,
  base64: string | null,
  mimeType: string,
  portionHint: string,
  env: FoodEnv,
): Promise<PipelineSuccess | PipelineFailure> {
  // Tier 0: classify
  const t0 = await tier0Classify(textInput || portionHint, hasImage, env);
  const foodName = t0.food_name;

  // Tier 1: label OCR (if classification is "label" and image is present)
  if (t0.classification === "label" && hasImage && base64) {
    const ocrResult = await ocrNutritionLabel(base64, mimeType, portionHint, env);
    if (ocrResult.ok) {
      return {
        ok: true,
        tier: 1,
        payload: {
          name: ocrResult.name,
          kcal: ocrResult.kcal,
          protein_g: ocrResult.protein_g,
          carbs_g: ocrResult.carbs_g,
          fat_g: ocrResult.fat_g,
          fiber_g: ocrResult.fiber_g,
          sugar_g: ocrResult.sugar_g,
          mealSlot: t0.meal_slot,
          source: "label",
          confidence: ocrResult.confidence,
          notes: `Porción: ${ocrResult.servingDescription}`,
        },
      };
    }
    // OCR failed → fall through to Tier 2
  }

  // Tier 2: similar_to_event
  const recentEvents = await getRecentFoodEvents(env, 30, 50);
  const similarity = await tier2SimilarityCheck(foodName, recentEvents, env);
  if (similarity.matched) {
    return {
      ok: true,
      tier: 2,
      payload: {
        name: similarity.name,
        kcal: similarity.kcal,
        protein_g: similarity.protein_g,
        carbs_g: similarity.carbs_g,
        fat_g: similarity.fat_g,
        fiber_g: similarity.fiber_g,
        mealSlot: t0.meal_slot,
        source: "similar_to_event",
        confidence: similarity.confidence,
        similarToEventId: similarity.eventId,
        notes: t0.notes,
      },
    };
  }

  // Tier 3: web_lookup
  if (env.BRAVE_SEARCH_API_KEY) {
    const webResult = await searchAndReconcileNutrition(
      foodName,
      env.BRAVE_SEARCH_API_KEY,
      env,
    );
    if (webResult.ok) {
      return {
        ok: true,
        tier: 3,
        payload: {
          name: webResult.name,
          kcal: webResult.kcal,
          protein_g: webResult.protein_g,
          carbs_g: webResult.carbs_g,
          fat_g: webResult.fat_g,
          fiber_g: webResult.fiber_g,
          mealSlot: t0.meal_slot,
          source: "web_lookup",
          confidence: webResult.confidence,
          sources: webResult.sources,
          notes: t0.notes,
        },
      };
    }
  }

  // Tier 4: vision_only (if image is present)
  if (hasImage && base64) {
    const visionResult = await analyzeImageForFood(base64, mimeType, textInput, env);
    if (visionResult.ok) {
      return {
        ok: true,
        tier: 4,
        payload: {
          name: visionResult.name,
          kcal: visionResult.kcal,
          protein_g: visionResult.protein_g,
          carbs_g: visionResult.carbs_g,
          fat_g: visionResult.fat_g,
          mealSlot: t0.meal_slot,
          source: "vision_only",
          confidence: visionResult.confidence,
          notes: visionResult.notes || t0.notes,
        },
      };
    }
  }

  return {
    ok: false,
    error:
      "No se pudo determinar el valor nutricional con ningún método disponible. Por favor, proporciona los valores manualmente.",
  };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleFoodLog(
  input: FoodLogInput,
  env: FoodEnv,
): Promise<FoodResult> {
  // Manual path: user provides exact values
  if (input.manual === true) {
    if (!input.name || typeof input.kcal !== "number" || typeof input.protein_g !== "number" ||
        typeof input.carbs_g !== "number" || typeof input.fat_g !== "number") {
      return {
        status: "failed",
        error: "Modo manual requiere: name, kcal, protein_g, carbs_g, fat_g.",
      };
    }

    const payload: FoodPayload = {
      name: input.name,
      kcal: input.kcal,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
      fiber_g: input.fiber_g ?? null,
      mealSlot: input.meal_slot ?? null,
      source: "manual",
      confidence: 1.0,
      notes: input.notes ?? null,
    };

    let entryId: string;
    try {
      entryId = await ensureFoodEntry(env);
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : "API error" };
    }

    let event: FoodEventItem;
    try {
      event = await postFoodEvent(
        env,
        entryId,
        payload,
        `tier=manual confidence=1.0`,
        input.occurred_at,
      );
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : "API error" };
    }

    return {
      status: "succeeded",
      output: {
        action: "logged",
        event_id: event.id,
        name: payload.name,
        kcal: payload.kcal,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
        meal_slot: payload.mealSlot,
        confidence: 1.0,
        source: "manual" as FoodMealSource,
        tier: 0,
        message: `Registrado: ${payload.name} (${Math.round(payload.kcal)} kcal)`,
      },
    };
  }

  // Automated pipeline (Tiers 0–4)
  const textInput = String(input.input ?? "");
  const hasImage = Boolean(input.image_base64);
  const base64 = input.image_base64 ?? null;
  const mimeType = input.image_mime_type ?? "image/jpeg";
  const portionHint = "";

  if (!textInput && !hasImage) {
    return {
      status: "failed",
      error: "Se requiere texto de entrada (`input`) o imagen (`image_base64`), o usa `manual: true`.",
    };
  }

  let pipeline: PipelineSuccess | PipelineFailure;
  try {
    pipeline = await runTierPipeline(textInput, hasImage, base64, mimeType, portionHint, env);
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Pipeline error" };
  }

  if (!pipeline.ok) {
    return { status: "failed", error: pipeline.error };
  }

  const { payload, tier } = pipeline;
  const source = payload.source as FoodMealSource;

  // Confirmation gate
  if (needsConfirmation(payload.confidence, source)) {
    const proposed: ProposedPayload = {
      name: payload.name,
      kcal: payload.kcal,
      protein_g: payload.protein_g,
      carbs_g: payload.carbs_g,
      fat_g: payload.fat_g,
      fiber_g: payload.fiber_g,
      meal_slot: payload.mealSlot ?? null,
      sources: payload.sources ?? null,
      confidence: payload.confidence,
      source,
    };

    return {
      status: "succeeded",
      output: {
        action: "pending_confirmation",
        proposed,
        confidence: payload.confidence,
        tier,
        message: buildConfirmationMessage(proposed),
      },
    };
  }

  // Auto-post (confidence ≥ 0.85 and source in {label, similar_to_event, manual})
  let entryId: string;
  try {
    entryId = await ensureFoodEntry(env);
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "API error" };
  }

  let event: FoodEventItem;
  try {
    event = await postFoodEvent(
      env,
      entryId,
      payload,
      `tier=${tier} confidence=${payload.confidence.toFixed(2)}`,
      input.occurred_at,
    );
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "API error" };
  }

  return {
    status: "succeeded",
    output: {
      action: "logged",
      event_id: event.id,
      name: payload.name,
      kcal: payload.kcal,
      protein_g: payload.protein_g,
      carbs_g: payload.carbs_g,
      fat_g: payload.fat_g,
      meal_slot: payload.mealSlot,
      confidence: payload.confidence,
      source,
      tier,
      similar_to_event_id: payload.similarToEventId ?? null,
      message: `Registrado: ${payload.name} (${Math.round(payload.kcal)} kcal)`,
    },
  };
}

async function handleFoodQuery(input: FoodQueryInput, env: FoodApiEnv): Promise<FoodResult> {
  const { from, to, limit } = input;
  if (!from || !to) {
    return { status: "failed", error: "Se requieren los campos `from` y `to` (YYYY-MM-DD)." };
  }

  let events: FoodEventItem[];
  try {
    events = await queryFoodEvents(env, from, to, limit ?? 50);
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "API error" };
  }

  const totalKcal = events.reduce((sum, e) => sum + (e.payload?.kcal ?? 0), 0);
  const totalProtein = events.reduce((sum, e) => sum + (e.payload?.protein_g ?? 0), 0);

  return {
    status: "succeeded",
    output: {
      from,
      to,
      count: events.length,
      total_kcal: Math.round(totalKcal),
      total_protein_g: Math.round(totalProtein * 10) / 10,
      events: events.map((e) => ({
        id: e.id,
        occurred_at: e.occurredAt,
        name: e.payload?.name ?? "",
        kcal: e.payload?.kcal ?? 0,
        protein_g: e.payload?.protein_g ?? 0,
        carbs_g: e.payload?.carbs_g ?? 0,
        fat_g: e.payload?.fat_g ?? 0,
        meal_slot: e.payload?.mealSlot ?? null,
      })),
    },
  };
}

async function handleFoodEdit(input: FoodEditInput, env: FoodApiEnv): Promise<FoodResult> {
  const { event_id, ...rest } = input;
  if (!event_id) {
    return { status: "failed", error: "Se requiere `event_id`." };
  }

  const patch: Partial<FoodPayload> = {};
  if (rest.name !== undefined) patch.name = rest.name;
  if (rest.kcal !== undefined) patch.kcal = rest.kcal;
  if (rest.protein_g !== undefined) patch.protein_g = rest.protein_g;
  if (rest.carbs_g !== undefined) patch.carbs_g = rest.carbs_g;
  if (rest.fat_g !== undefined) patch.fat_g = rest.fat_g;
  if (rest.fiber_g !== undefined) patch.fiber_g = rest.fiber_g;
  if (rest.meal_slot !== undefined) patch.mealSlot = rest.meal_slot;
  if (rest.notes !== undefined) patch.notes = rest.notes;

  if (Object.keys(patch).length === 0) {
    return { status: "failed", error: "No se proporcionaron campos a editar." };
  }

  let event: FoodEventItem;
  try {
    event = await patchFoodEvent(env, event_id, patch);
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "API error" };
  }

  return {
    status: "succeeded",
    output: {
      event_id: event.id,
      name: event.payload?.name ?? "",
      kcal: event.payload?.kcal ?? 0,
      message: `Actualizado: ${event.payload?.name ?? event_id}`,
    },
  };
}

async function handleFoodDelete(input: FoodDeleteInput, env: FoodApiEnv): Promise<FoodResult> {
  const { event_id } = input;
  if (!event_id) {
    return { status: "failed", error: "Se requiere `event_id`." };
  }

  try {
    await deleteFoodEvent(env, event_id);
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "API error" };
  }

  return {
    status: "succeeded",
    output: {
      event_id,
      message: "Evento de comida eliminado (el historial de auditoría se conserva).",
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Dispatches tool calls for the mikoshi-tracker-food skill.
 * run.ts is a thin stdin/stdout shim around this function.
 */
export async function runFoodSkill(
  envelope: FoodEnvelope,
  env: Partial<FoodEnv>,
): Promise<FoodResult> {
  const token = env.MIKOSHI_TRACKER_PERSONAL_TOKEN;
  if (!token) {
    return { status: "failed", error: "needs-enrolment" };
  }

  const proxyToken = env.MIKOSHI_LLM_PROXY_TOKEN;
  if (!proxyToken) {
    // The proxy bearer is provisioned on mikoshi startup and injected into
    // this subprocess via SkillToolExecutor. If it's missing, the runtime
    // hasn't picked up the manifest's optional secret declaration yet —
    // tell the operator/agent verbatim.
    return {
      status: "failed",
      error:
        "missing-proxy-token: MIKOSHI_LLM_PROXY_TOKEN. El pipeline de comida " +
        "necesita el bearer del skill-LLM proxy. Reinicia el runtime de mikoshi: " +
        "lo provisiona automáticamente al arrancar.",
    };
  }

  const apiBase = (env.MIKOSHI_TRACKER_API_URL ?? "http://localhost:7080/api").replace(/\/$/, "");
  const foodApiEnv: FoodApiEnv = {
    MIKOSHI_TRACKER_PERSONAL_TOKEN: token,
    MIKOSHI_TRACKER_API_URL: apiBase,
  };
  const fullEnv: FoodEnv = {
    ...foodApiEnv,
    MIKOSHI_LLM_PROXY_URL: env.MIKOSHI_LLM_PROXY_URL,
    MIKOSHI_LLM_PROXY_TOKEN: proxyToken,
    BRAVE_SEARCH_API_KEY: env.BRAVE_SEARCH_API_KEY,
  };

  const { tool, input } = envelope;

  try {
    if (tool === "food_log_from_input") {
      return await handleFoodLog(input as FoodLogInput, fullEnv);
    }
    if (tool === "food_query_range") {
      return await handleFoodQuery(input as unknown as FoodQueryInput, foodApiEnv);
    }
    if (tool === "food_edit_event") {
      return await handleFoodEdit(input as unknown as FoodEditInput, foodApiEnv);
    }
    if (tool === "food_delete_event") {
      return await handleFoodDelete(input as unknown as FoodDeleteInput, foodApiEnv);
    }
    return { status: "failed", error: `Herramienta desconocida: ${tool}` };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Error inesperado en el skill de comida",
    };
  }
}
