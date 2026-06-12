/**
 * mikoshi-tracker-food — OCR for nutrition labels (Tier 1: label).
 *
 * Sends a nutrition label image through the skill-LLM proxy (vision tier)
 * and extracts the per-serving nutritional values. Confidence is capped
 * at 0.95.
 */

import { callLlmProxy, safeParseJsonObject, type LlmProxyEnv } from "./llm.js";

interface OcrNutritionData {
  product_name: string;
  serving_description: string;
  kcal_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  confidence: number;
}

export interface OcrLabelResult {
  ok: true;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  confidence: number;
  servingDescription: string;
}

export interface OcrLabelError {
  ok: false;
  error: string;
}

/**
 * Tier 1 — label. Extracts nutritional information from a nutrition label
 * image. If the user specifies a portion, the values are already
 * per-declared-serving from the label; the model applies them directly.
 *
 * Confidence is capped at 0.95 (a label is highly reliable but OCR can fail).
 */
export async function ocrNutritionLabel(
  base64: string,
  mimeType: string,
  portionHint: string,
  env: LlmProxyEnv,
): Promise<OcrLabelResult | OcrLabelError> {
  const portionNote = portionHint
    ? `The user mentioned this portion: "${portionHint}". Apply it if different from the label's serving.`
    : "";

  const prompt = `This is a nutrition label (etiqueta nutricional). Extract the per-serving nutritional values accurately.
${portionNote}

Respond with ONLY a JSON object, no markdown:
{
  "product_name": "<product name or description in Spanish, from label if present>",
  "serving_description": "<serving size as shown, e.g. '30g' or '1 biscuit'>",
  "kcal_per_serving": <integer>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "fiber_g": <number or null if not shown>,
  "sugar_g": <number or null if not shown>,
  "confidence": <0.7-0.95, lower if label is partially illegible>
}`;

  let raw: string;
  try {
    raw = await callLlmProxy(env, {
      taskKey: "skill.vision",
      prompt,
      image: { base64, mimeType },
      maxTokens: 512,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "OCR proxy error" };
  }

  const parsed = safeParseJsonObject(raw) as OcrNutritionData | null;
  if (
    !parsed ||
    typeof parsed.kcal_per_serving !== "number" ||
    typeof parsed.protein_g !== "number" ||
    typeof parsed.carbs_g !== "number" ||
    typeof parsed.fat_g !== "number"
  ) {
    return { ok: false, error: "Could not parse nutrition values from label" };
  }

  return {
    ok: true,
    name: parsed.product_name ?? "Producto etiquetado",
    kcal: Math.max(0, Math.round(parsed.kcal_per_serving)),
    protein_g: Math.max(0, Math.round(parsed.protein_g * 10) / 10),
    carbs_g: Math.max(0, Math.round(parsed.carbs_g * 10) / 10),
    fat_g: Math.max(0, Math.round(parsed.fat_g * 10) / 10),
    fiber_g: parsed.fiber_g != null ? Math.max(0, Math.round(parsed.fiber_g * 10) / 10) : null,
    sugar_g: parsed.sugar_g != null ? Math.max(0, Math.round(parsed.sugar_g * 10) / 10) : null,
    confidence: Math.min(0.95, Math.max(0.7, parsed.confidence ?? 0.85)),
    servingDescription: parsed.serving_description ?? "",
  };
}
