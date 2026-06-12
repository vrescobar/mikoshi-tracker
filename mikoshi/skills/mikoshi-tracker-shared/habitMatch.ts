/**
 * Shared contextual habit matcher for the MikoshiTracker habit skills.
 *
 * Resolving a habit by a human's wording is the recurring failure mode: a
 * paraphrase ("despertarme cuando suena el despertador"), a synonym, a typo, or
 * deixis ("ésta", "la de antes") rarely equals the stored habit name
 * ("Levantarme cuando suena el despertador"). This module resolves it in layers:
 *
 *   1. Deterministic, zero-cost: accent-insensitive exact match, then
 *      bidirectional substring. One candidate → done (no LLM cost).
 *   2. LLM contextual match over the FULL candidate list (with optional
 *      conversation context), tolerant to paraphrase / synonyms / reordering /
 *      indirect speech, and able to flag genuine ambiguity instead of guessing.
 *   3. Actionable failure that LISTS the candidates with friendly descriptors
 *      (kind, unit/target, today's status) so the agent can explain to the user
 *      what each habit is and ask which one.
 *
 * Returns a discriminated outcome (never throws) so each skill maps the error to
 * its own failure type without cross-module `instanceof` coupling.
 */

import { callLlmProxy, llmProxyAvailable, safeParseJsonObject, type LlmProxyEnv } from "./llm.js";

/**
 * Minimal shape the matcher needs. `name` is required; the rest are optional
 * metadata used only to build friendlier descriptors and help the LLM
 * disambiguate by kind. Personal `GET /habits` and circle member-habits both
 * structurally satisfy this.
 */
export interface HabitLike {
  name: string;
  kind?: string | null;
  unit?: string | null;
  targetValue?: number | null;
  isActive?: boolean;
  /** Circle member-habits expose today's state; personal lists don't. */
  todayStatus?: string | null;
  todayValue?: number | null;
}

export type MatchOutcome<T> = { ok: true; habit: T } | { ok: false; error: string };

export interface ResolveOptions<T> {
  /** Verbatim user utterance / hint to disambiguate indirect speech. */
  context?: string;
  /** Override the friendly descriptor used in clarify/not-found errors. */
  describe?: (h: T) => string;
}

/** Lowercase + strip accents/diacritics so "levántate" ≈ "levantate". */
export function normalizeHabit(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Friendly one-line descriptor of a habit for clarify/not-found messages:
 *   - "Meditar" (sí/no, hoy pendiente)
 *   - "Beber agua" (8 vasos/día, hoy 3/8)
 * Degrades gracefully when metadata is absent.
 */
export function describeCandidate(h: HabitLike): string {
  const bits: string[] = [];
  if (h.kind === "quantity") {
    const target = typeof h.targetValue === "number" ? String(h.targetValue) : null;
    const unit = h.unit ?? "";
    if (target) bits.push(`${target}${unit ? ` ${unit}` : ""}`.trim());
    else bits.push("cantidad");
    if (typeof h.todayValue === "number") {
      bits.push(`hoy ${h.todayValue}${target ? `/${target}` : ""}`);
    }
  } else if (h.kind === "boolean") {
    bits.push("sí/no");
    if (h.todayStatus) bits.push(`hoy ${translateStatus(h.todayStatus)}`);
  } else if (h.todayStatus) {
    bits.push(`hoy ${translateStatus(h.todayStatus)}`);
  }
  if (h.isActive === false) bits.push("archivado");
  const suffix = bits.length ? ` (${bits.join(", ")})` : "";
  return `"${h.name}"${suffix}`;
}

function translateStatus(s: string): string {
  switch (s) {
    case "completed":
      return "completado";
    case "pending":
      return "pendiente";
    case "available":
      return "disponible";
    case "not_due":
      return "no toca";
    case "missed":
      return "perdido";
    default:
      return s;
  }
}

function listCandidates<T extends HabitLike>(
  habits: T[],
  describe: (h: T) => string,
  cap = 10,
): string {
  if (habits.length === 0) return "ninguno";
  const shown = habits.slice(0, cap).map(describe).join("; ");
  const extra = habits.length > cap ? ` (+${habits.length - cap} más)` : "";
  return shown + extra;
}

/**
 * Deterministic candidate set: accent-insensitive exact match wins; otherwise
 * bidirectional substring (query ⊂ name, e.g. "despertador" ⊂ "…despertador"; or
 * name ⊂ query, e.g. "leer" when the user said "leer un rato"). 0, 1, or many.
 */
export function substringCandidates<T extends HabitLike>(habits: T[], query: string): T[] {
  const nq = normalizeHabit(query);
  if (!nq) return [];
  const exact = habits.filter((h) => normalizeHabit(h.name) === nq);
  if (exact.length > 0) return exact;
  return habits.filter((h) => {
    const nn = normalizeHabit(h.name);
    return nn.includes(nq) || nq.includes(nn);
  });
}

interface LlmMatchResult {
  /** Index of the best match, or null when none is reasonable. */
  match: number | null;
  /** Indices the model genuinely can't decide between (≥2 ⇒ ask the user). */
  ambiguous?: number[];
}

async function llmHabitMatch<T extends HabitLike>(
  habits: T[],
  query: string,
  env: LlmProxyEnv,
  context: string | undefined,
  describe: (h: T) => string,
): Promise<LlmMatchResult | null> {
  if (!llmProxyAvailable(env)) return null;

  const numbered = habits.map((h, i) => `${i}. ${describe(h)}`).join("\n");
  const contextLine = context && context.trim() ? `\nContexto de la conversación: "${context.trim()}"` : "";
  const prompt =
    `El usuario quiere referirse a uno de sus hábitos.\n` +
    `Lo que dijo / cómo lo nombró: "${query}"${contextLine}\n\n` +
    `Hábitos disponibles (índice. descripción):\n${numbered}\n\n` +
    `Devuelve SOLO un objeto JSON. Si un hábito coincide claramente con lo que el ` +
    `usuario quiso decir —tolerando paráfrasis, sinónimos, erratas, reordenación, ` +
    `mezcla español/inglés y referencias indirectas ("ésta", "la de antes")—, ` +
    `responde {"match": <índice>}. Usa el tipo (sí/no vs cantidad) y el contexto ` +
    `para desambiguar. Si dudas genuinamente entre varios, responde ` +
    `{"match": null, "ambiguous": [<índices>]}. Si ninguno encaja, {"match": null}.`;

  let text: string;
  try {
    text = await callLlmProxy(env, {
      taskKey: "skill.text",
      prompt,
      systemPrompt:
        'Eres un matcher de hábitos. Respondes únicamente con un objeto JSON: {"match": número|null, "ambiguous"?: número[]}.',
      maxTokens: 60,
    });
  } catch {
    return null; // proxy down / not provisioned — caller degrades
  }

  const parsed = safeParseJsonObject(text) as LlmMatchResult | null;
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

/**
 * Resolve a habit by a (possibly paraphrased / indirect) name. Never throws —
 * returns `{ok:true,habit}` or `{ok:false,error}` with a rich, actionable
 * message that lists the candidates so the agent can explain and ask.
 */
export async function resolveHabit<T extends HabitLike>(
  habits: T[],
  query: string,
  env: LlmProxyEnv,
  opts: ResolveOptions<T> = {},
): Promise<MatchOutcome<T>> {
  const describe = opts.describe ?? ((h: T) => describeCandidate(h));

  if (habits.length === 0) {
    return { ok: false, error: `No tienes ningún hábito que encaje con "${query}".` };
  }

  const candidates = substringCandidates(habits, query);
  if (candidates.length === 1) return { ok: true, habit: candidates[0]! };

  const viaLlm = await llmHabitMatch(habits, query, env, opts.context, describe);
  if (viaLlm) {
    const idx = viaLlm.match;
    if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < habits.length) {
      return { ok: true, habit: habits[idx]! };
    }
    if (Array.isArray(viaLlm.ambiguous) && viaLlm.ambiguous.length > 1) {
      const amb = viaLlm.ambiguous
        .filter((i) => Number.isInteger(i) && i >= 0 && i < habits.length)
        .map((i) => habits[i]!);
      if (amb.length > 1) {
        return {
          ok: false,
          error: `"${query}" puede referirse a varios hábitos: ${listCandidates(amb, describe)}. ¿Cuál de ellos?`,
        };
      }
    }
  }

  // LLM unavailable/declined, or deterministic was ambiguous.
  if (candidates.length > 1) {
    return {
      ok: false,
      error: `"${query}" coincide con varios hábitos: ${listCandidates(candidates, describe)}. ¿Cuál de ellos?`,
    };
  }
  return {
    ok: false,
    error: `No encontré un hábito que encaje con "${query}". Tus hábitos: ${listCandidates(habits, describe)}.`,
  };
}
