/**
 * mikoshi-tracker-food — Brave Search + LLM reconciliation (Tier 3: web_lookup).
 *
 * Searches for nutritional information using Brave Search, then asks the
 * configured text runtime (skill.text tier) to reconcile the results into a
 * single best-estimate payload. Confidence is capped at 0.70.
 */

import { callLlmProxy, safeParseJsonObject, type LlmProxyEnv } from "./llm.js";

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveApiResponse {
  web?: { results?: BraveWebResult[] };
}

interface ReconciledNutrition {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  confidence: number;
  reasoning: string;
}

export interface WebSearchResult {
  ok: true;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: number;
  sources: string[];
}

export interface WebSearchError {
  ok: false;
  error: string;
}

async function searchBrave(
  query: string,
  apiKey: string,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("country", "ES");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave Search API ${res.status}`);
  }

  const data = (await res.json()) as BraveApiResponse;
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}

async function reconcileWithLlm(
  foodQuery: string,
  searchResults: Array<{ title: string; url: string; snippet: string }>,
  env: LlmProxyEnv,
): Promise<string> {
  const snippets = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
    .join("\n\n");

  const prompt = `I'm looking for the nutritional content of: "${foodQuery}"

Here are web search results:
${snippets}

Based on these results, provide a best-estimate nutritional value for a typical serving of "${foodQuery}".
If results are inconsistent, use the average or most reliable source.

Respond with ONLY a JSON object, no markdown:
{
  "name": "<food name in Spanish, e.g. 'Arroz blanco cocido (200g)'>",
  "kcal": <integer>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "fiber_g": <number or null>,
  "confidence": <0.3-0.70, higher if results agree>,
  "reasoning": "<one sentence on why you chose these values>"
}`;

  return callLlmProxy(env, {
    taskKey: "skill.text",
    prompt,
    maxTokens: 512,
  });
}

/**
 * Tier 3 — web_lookup. Searches Brave for nutritional data and uses the
 * configured text runtime to reconcile results. Returns the consulted URLs
 * in `sources`. Confidence is capped at 0.70.
 */
export async function searchAndReconcileNutrition(
  foodQuery: string,
  braveApiKey: string,
  env: LlmProxyEnv,
): Promise<WebSearchResult | WebSearchError> {
  // Build a nutritional search query in Spanish
  const searchQuery = `información nutricional ${foodQuery} calorías proteínas`;

  let searchResults: Array<{ title: string; url: string; snippet: string }>;
  try {
    searchResults = await searchBrave(searchQuery, braveApiKey);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Brave Search error" };
  }

  if (searchResults.length === 0) {
    return { ok: false, error: "No web results found for this food" };
  }

  let raw: string;
  try {
    raw = await reconcileWithLlm(foodQuery, searchResults, env);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "LLM reconcile error" };
  }

  const parsed = safeParseJsonObject(raw) as ReconciledNutrition | null;
  if (
    !parsed ||
    typeof parsed.kcal !== "number" ||
    typeof parsed.protein_g !== "number" ||
    typeof parsed.carbs_g !== "number" ||
    typeof parsed.fat_g !== "number"
  ) {
    return { ok: false, error: "Could not parse reconciled nutritional values" };
  }

  const sources = searchResults.map((r) => r.url).filter(Boolean);

  return {
    ok: true,
    name: parsed.name ?? foodQuery,
    kcal: Math.max(0, Math.round(parsed.kcal)),
    protein_g: Math.max(0, Math.round(parsed.protein_g * 10) / 10),
    carbs_g: Math.max(0, Math.round(parsed.carbs_g * 10) / 10),
    fat_g: Math.max(0, Math.round(parsed.fat_g * 10) / 10),
    fiber_g: parsed.fiber_g != null ? Math.max(0, Math.round(parsed.fiber_g * 10) / 10) : null,
    confidence: Math.min(0.7, Math.max(0.3, parsed.confidence ?? 0.5)),
    sources,
  };
}
