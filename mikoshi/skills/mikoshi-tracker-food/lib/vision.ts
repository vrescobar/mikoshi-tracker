/**
 * mikoshi-tracker-food — vision analysis (Tier 4: vision_only).
 *
 * Estimates nutritional content from a food photo when no label, history
 * match, or web result is available. Confidence is always ≤ 0.55.
 * Dispatches to whichever runtime is wired to `skill.vision` (default:
 * vision tier → Gemma E4B → Qwen 2B → codex/gpt-4.1).
 */

import { callLlmProxy, safeParseJsonObject, type LlmProxyEnv } from "./llm.js";

interface VisionNutrition {
  name: string;
  description: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
}

export interface VisionResult {
  ok: true;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  notes: string;
}

export interface VisionError {
  ok: false;
  error: string;
}

/**
 * Tier 4 — vision_only. Analyzes a food photo and estimates nutritional
 * content. Confidence is capped at 0.55 per the spec.
 */
export async function analyzeImageForFood(
  base64: string,
  mimeType: string,
  contextHint: string,
  env: LlmProxyEnv,
): Promise<VisionResult | VisionError> {
  const prompt = `Look at this food photo. ${contextHint ? `Context: ${contextHint}.` : ""}

Estimate the nutritional content as accurately as possible based on what you can see.
Consider portion size, ingredients, and typical nutritional profiles.

Respond with ONLY a JSON object, no markdown:
{
  "name": "<concise food name in Spanish>",
  "description": "<brief description of what you see>",
  "kcal": <estimated calories as integer>,
  "protein_g": <protein in grams as number>,
  "carbs_g": <carbohydrates in grams as number>,
  "fat_g": <fat in grams as number>,
  "confidence": <your confidence 0.0-0.55, lower if unclear>
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
    return { ok: false, error: err instanceof Error ? err.message : "Vision proxy error" };
  }

  const parsed = safeParseJsonObject(raw) as VisionNutrition | null;
  if (
    !parsed ||
    typeof parsed.name !== "string" ||
    typeof parsed.kcal !== "number" ||
    typeof parsed.protein_g !== "number" ||
    typeof parsed.carbs_g !== "number" ||
    typeof parsed.fat_g !== "number"
  ) {
    return { ok: false, error: "Vision model returned unstructured response" };
  }

  return {
    ok: true,
    name: parsed.name,
    kcal: Math.max(0, Math.round(parsed.kcal)),
    protein_g: Math.max(0, Math.round(parsed.protein_g * 10) / 10),
    carbs_g: Math.max(0, Math.round(parsed.carbs_g * 10) / 10),
    fat_g: Math.max(0, Math.round(parsed.fat_g * 10) / 10),
    confidence: Math.min(0.55, Math.max(0, parsed.confidence ?? 0.45)),
    notes: parsed.description ?? "",
  };
}
