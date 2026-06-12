/**
 * MikoshiTracker Circle skill — core logic, importable in-process.
 *
 * run.ts is a thin stdin/stdout shim around runMikoshiTrackerCircle().
 * Tests should call this directly to avoid the cost of spawning bun.
 *
 * Auth model (matches the real tracker `circle.routes.ts`):
 *   - Circle reads + check-ins (`/members/:userId/...`) use the shared CIRCLE
 *     token; the member is identified by the `:userId` path segment, resolved
 *     from the trusted `caller.identityId` via the circle's membership list
 *     (member.externalId === Mikoshi identityId).
 *   - `circle_join` shares one of the caller's OWN habits and therefore uses
 *     the caller's PERSONAL token (BearerAuth on `/api/habits` + `/shares`).
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveHabit, type HabitLike } from "../mikoshi-tracker-shared/habitMatch.js";
import {
  renderCircleCardPng,
  renderDonutPng,
  cardSummary,
  donutSummary,
  mapLeaderboardRows,
  type CardRow,
} from "./card.js";

export interface CallerInfo {
  identityId?: string;
  jid?: string;
  displayName?: string;
}

export interface CircleEnvelope {
  tool: string;
  input: Record<string, unknown>;
  workspaceDir?: string;
  caller?: CallerInfo;
}

export interface CircleEnv {
  MIKOSHI_TRACKER_PERSONAL_TOKEN?: string;
  MIKOSHI_TRACKER_CIRCLE_TOKEN?: string;
  MIKOSHI_TRACKER_CIRCLE_ID?: string;
  MIKOSHI_TRACKER_CIRCLE_API_URL?: string;
  // Skill-LLM-proxy (optional): enables contextual habit matching. Injected by
  // SkillToolExecutor from the optional manifest secrets.
  MIKOSHI_LLM_PROXY_URL?: string;
  MIKOSHI_LLM_PROXY_TOKEN?: string;
}

export type CircleResult =
  | { status: "succeeded"; output: unknown }
  | { status: "failed"; error: string; provider?: string };

class RunnerFailure extends Error {
  readonly provider?: string;
  constructor(message: string, provider?: string) {
    super(message);
    this.provider = provider;
  }
}

function needsEnrolment(): never {
  throw new RunnerFailure("needs-enrolment", "mikoshi-tracker");
}

interface CircleMember {
  userId: string;
  externalId: string | null;
  displayName: string;
  role?: string;
}

interface CircleMemberHabit {
  habitId: string;
  name: string;
  kind?: string;
  // Backend also returns today's state + target/unit; optional here so they only
  // enrich the matcher's descriptors when present.
  todayStatus?: string | null;
  todayValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
}

interface PersonalHabit {
  id: string;
  name: string;
  kind?: string;
  unit?: string | null;
  targetValue?: number | null;
  isActive?: boolean;
}

/**
 * Turn a non-2xx response into a human-readable, jargon-free message. The
 * tracker returns `{ code, message }` on errors; we surface that, but never
 * leak raw HTTP status codes or endpoint paths to the caller (the SOUL is told
 * the same: translate failures, don't parrot 404s).
 */
async function describeHttpError(r: Response, label: string): Promise<string> {
  let backendMessage = "";
  let backendCode = "";
  try {
    const text = await r.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string; code?: string };
        backendMessage = parsed.message ?? "";
        backendCode = parsed.code ?? "";
      } catch {
        backendMessage = text;
      }
    }
  } catch {
    /* body already consumed or unreadable — fall back to status mapping */
  }

  if (backendCode === "HABIT_INACTIVE") {
    return `${label}: ese hábito está archivado; restáuralo antes de poder registrarlo.`;
  }
  if (backendCode === "UNDO_NOT_CIRCLE_SOURCED") {
    return `${label}: el último registro de ese hábito no lo hizo el círculo, así que no lo deshago para no tocar tu historial personal.`;
  }
  if (r.status === 401 || r.status === 403) {
    return `${label}: el acceso al círculo fue rechazado (el token del círculo no es válido o ha caducado).`;
  }
  if (r.status === 404) {
    return `${label}: no lo encuentro en el círculo (puede que el hábito no esté compartido todavía).`;
  }
  if (r.status === 409) {
    return `${label}: ${backendMessage || "el registro choca con el estado actual del hábito."}`;
  }
  return backendMessage ? `${label}: ${backendMessage}` : `${label}: el servicio no respondió correctamente.`;
}

async function fetchJson<T>(url: string, opts: RequestInit, label: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error de red";
    throw new RunnerFailure(`${label}: no pude conectar con MikoshiTracker (${msg}).`);
  }
  if (!r.ok) {
    throw new RunnerFailure(await describeHttpError(r, label));
  }
  return (await r.json()) as T;
}

async function postVoid(url: string, opts: RequestInit, label: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error de red";
    throw new RunnerFailure(`${label}: no pude conectar con MikoshiTracker (${msg}).`);
  }
  if (!r.ok) {
    throw new RunnerFailure(await describeHttpError(r, label));
  }
  // 204 No Content responses have an empty body.
  const text = await r.text();
  return text ? (JSON.parse(text) as unknown) : { ok: true };
}

/**
 * Resolve a habit by a (possibly paraphrased / indirect) name via the shared
 * contextual matcher; throw an actionable RunnerFailure on miss/ambiguity. The
 * error already lists the candidates with friendly descriptors so the agent can
 * explain what each habit is and ask which one. `context` is the verbatim user
 * utterance used to disambiguate indirect speech.
 */
async function resolveHabitByName<T extends HabitLike>(
  habits: T[],
  query: string,
  env: CircleEnv,
  context?: string,
): Promise<T> {
  const outcome = await resolveHabit(habits, query, env, { context });
  if (!outcome.ok) throw new RunnerFailure(outcome.error);
  return outcome.habit;
}

/**
 * Resolve the caller's tracker userId from the circle's membership list, keyed
 * by `member.externalId === caller.identityId`. Uses the shared circle token
 * (read scope). Throws an actionable failure when the caller isn't a member.
 */
async function resolveMemberUserId(
  base: string,
  circleId: string,
  circleToken: string,
  identityId: string | undefined,
): Promise<string> {
  if (!identityId) {
    throw new RunnerFailure(
      "No puedo identificar quién eres en este chat, así que no puedo tocar tu marcador del círculo.",
    );
  }
  const { members } = await fetchJson<{ members: CircleMember[] }>(
    `${base}/api/circles/${circleId}/members`,
    {
      headers: {
        Authorization: `Bearer ${circleToken}`,
        "Content-Type": "application/json",
      },
    },
    "No pude leer los miembros del círculo",
  );
  const me = members.find((m) => m.externalId === identityId);
  if (!me) {
    throw new RunnerFailure(
      "Todavía no estás dado de alta en este círculo. Pídele al owner que te añada (o conecta tu cuenta de MikoshiTracker) y vuelve a intentarlo.",
    );
  }
  return me.userId;
}

/**
 * Owner gate for cross-member corrections (rename, correcting someone else's
 * check-ins). Reuses the circle's membership list and requires the caller's
 * matched membership to have `role === 'owner'` — the tracker is the single
 * source of truth for who owns the circle, so no extra secret is needed. Returns
 * the membership list so callers can resolve the target without re-fetching.
 */
async function requireCircleOwner(
  base: string,
  circleId: string,
  circleToken: string,
  identityId: string | undefined,
): Promise<{ members: CircleMember[] }> {
  if (!identityId) {
    throw new RunnerFailure(
      "No puedo identificar quién eres en este chat, así que no puedo hacer correcciones en nombre de otros miembros.",
    );
  }
  const { members } = await fetchJson<{ members: CircleMember[] }>(
    `${base}/api/circles/${circleId}/members`,
    {
      headers: {
        Authorization: `Bearer ${circleToken}`,
        "Content-Type": "application/json",
      },
    },
    "No pude leer los miembros del círculo",
  );
  const me = members.find((m) => m.externalId === identityId);
  if (!me) {
    throw new RunnerFailure(
      "Todavía no estás dado de alta en este círculo, así que no puedo hacer correcciones en nombre de otros.",
    );
  }
  if (me.role !== "owner") {
    throw new RunnerFailure(
      "Solo el owner del círculo puede corregir o renombrar a otros miembros. Pídeselo a quien creó el círculo.",
    );
  }
  return { members };
}

/**
 * Validate the `date` param the way SKILL.md promises: strict YYYY-MM-DD,
 * at most 14 days back, never in the future. The tracker backend has its own
 * caps, but a hallucinated date must fail HERE with an actionable message
 * instead of silently corrupting the leaderboard if the backend ever relaxes.
 * Comparison is by UTC calendar date with one day of forward tolerance for
 * members whose timezone is ahead of the server's.
 */
function validateBackdate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RunnerFailure(
      `La fecha "${date}" no tiene formato YYYY-MM-DD — resuelve "ayer"/"el lunes" a la fecha concreta.`,
    );
  }
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    throw new RunnerFailure(`La fecha "${date}" no es una fecha real.`);
  }
  const DAY_MS = 86_400_000;
  const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  if (parsed > todayUtc + DAY_MS) {
    throw new RunnerFailure(`La fecha "${date}" está en el futuro — no se pueden registrar check-ins futuros.`);
  }
  if (parsed < todayUtc - 14 * DAY_MS) {
    throw new RunnerFailure(
      `La fecha "${date}" queda fuera de la ventana de corrección (máximo 14 días atrás).`,
    );
  }
}

/** Lowercase + strip accents so member matching tolerates "josé" vs "Jose". */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolve a target member from a free-form selector — an exact userId (as it
 * appears in the leaderboard) or a display-name substring. Throws an actionable
 * failure listing candidates on a miss or an ambiguous match.
 */
function resolveTargetMember(members: CircleMember[], selector: string): CircleMember {
  const byId = members.find((m) => m.userId === selector);
  if (byId) return byId;
  const needle = normalizeForMatch(selector);
  const matches = members.filter((m) => normalizeForMatch(m.displayName).includes(needle));
  if (matches.length === 1) return matches[0]!;
  const names = members.map((m) => m.displayName).join(", ");
  if (matches.length === 0) {
    throw new RunnerFailure(`No encuentro a "${selector}" en el círculo. Miembros: ${names}.`);
  }
  throw new RunnerFailure(
    `"${selector}" coincide con varios miembros (${matches.map((m) => m.displayName).join(", ")}). Sé más específico.`,
  );
}

async function fetchMemberHabits(
  base: string,
  circleId: string,
  userId: string,
  circleAuth: Record<string, string>,
): Promise<CircleMemberHabit[]> {
  const { habits } = await fetchJson<{ habits: CircleMemberHabit[] }>(
    `${base}/api/circles/${circleId}/members/${userId}/habits`,
    { headers: circleAuth },
    "No pude leer tus hábitos del círculo",
  );
  return habits;
}

export async function runMikoshiTrackerCircle(
  envelope: CircleEnvelope,
  env: CircleEnv,
): Promise<CircleResult> {
  try {
    const circleToken = env.MIKOSHI_TRACKER_CIRCLE_TOKEN;
    const circleId = env.MIKOSHI_TRACKER_CIRCLE_ID;
    const apiUrl = env.MIKOSHI_TRACKER_CIRCLE_API_URL;

    const missingBase: string[] = [];
    if (!circleToken) missingBase.push("MIKOSHI_TRACKER_CIRCLE_TOKEN");
    if (!circleId) missingBase.push("MIKOSHI_TRACKER_CIRCLE_ID");
    if (!apiUrl) missingBase.push("MIKOSHI_TRACKER_CIRCLE_API_URL");
    if (missingBase.length > 0) {
      throw new RunnerFailure(`Missing required env vars: ${missingBase.join(", ")}`);
    }

    const base = apiUrl!.replace(/\/$/, "");
    const { tool, input } = envelope;
    const identityId = envelope.caller?.identityId;
    const matchContext = (input["context"] as string | undefined) ?? undefined;

    const circleAuth: Record<string, string> = {
      Authorization: `Bearer ${circleToken}`,
      "Content-Type": "application/json",
    };

    if (tool === "circle_leaderboard") {
      const leaderboard = await fetchJson<unknown>(
        `${base}/api/circles/${circleId}/leaderboard`,
        { headers: circleAuth },
        "No pude leer la tabla del círculo",
      );
      return { status: "succeeded", output: leaderboard };
    }

    // ── Weekly scoreboard CARD: deterministic PNG render (no LLM) ────────────
    // Renders the neón leaderboard image, writes it to the workspace, and tells
    // the runtime to pin it for 7 days. `summary` gives the model the standings
    // so it can write its commentary in a single tool call.
    if (tool === "circle_card") {
      const data = await fetchJson<{
        leaderboard: Array<{
          displayName: string;
          weeklyCompletedCount: number;
          weeklyTargetCount: number;
          weeklyCompletionRate: number;
        }>;
      }>(
        `${base}/api/circles/${circleId}/leaderboard`,
        { headers: circleAuth },
        "No pude leer la tabla del círculo",
      );
      const rows: CardRow[] = data.leaderboard.map((r) => ({
        name: r.displayName,
        done: r.weeklyCompletedCount,
        target: r.weeklyTargetCount,
        pct: Math.round(r.weeklyCompletionRate * 100),
      }));
      const workspaceDir = envelope.workspaceDir;
      if (!workspaceDir) {
        throw new RunnerFailure("No hay workspace para escribir la imagen del marcador.");
      }
      const filename = "circle-card.png";
      const png = await renderCircleCardPng(rows);
      writeFileSync(join(workspaceDir, filename), png);
      // On-demand cards do NOT pin — pinning is exclusive to the deterministic
      // weekly parte (handled by the runtime, not this tool).
      return {
        status: "succeeded",
        output: {
          workspace_output_files: [filename],
          summary: cardSummary(rows),
        },
      };
    }

    // ── Group progress DONUT (on-demand "¿cómo va el grupo?") ────────────────
    if (tool === "circle_donut") {
      const data = await fetchJson<{
        leaderboard: Array<{
          displayName: string;
          weeklyCompletedCount: number;
          weeklyTargetCount: number;
          weeklyCompletionRate: number;
        }>;
      }>(
        `${base}/api/circles/${circleId}/leaderboard`,
        { headers: circleAuth },
        "No pude leer la tabla del círculo",
      );
      const rows = mapLeaderboardRows(data);
      const workspaceDir = envelope.workspaceDir;
      if (!workspaceDir) {
        throw new RunnerFailure("No hay workspace para escribir la imagen del donut.");
      }
      const filename = "circle-donut.png";
      writeFileSync(join(workspaceDir, filename), await renderDonutPng(rows));
      return {
        status: "succeeded",
        output: {
          workspace_output_files: [filename],
          summary: donutSummary(rows),
        },
      };
    }

    // ── Check-ins: circle token + caller's resolved userId ──────────────────
    if (tool === "circle_report") {
      const habitQuery = (input["habit"] as string | undefined) ?? "";
      if (!habitQuery) {
        throw new RunnerFailure("Dime qué hábito quieres registrar.");
      }
      const memberSelector = (input["member"] as string | undefined) ?? "";
      const date = (input["date"] as string | undefined) ?? undefined;
      if (date) validateBackdate(date);

      // Self by default; targeting another member is owner-only.
      let userId: string;
      if (memberSelector) {
        const { members } = await requireCircleOwner(base, circleId!, circleToken!, identityId);
        userId = resolveTargetMember(members, memberSelector).userId;
      } else {
        userId = await resolveMemberUserId(base, circleId!, circleToken!, identityId);
      }

      const habits = await fetchMemberHabits(base, circleId!, userId, circleAuth);
      if (habits.length === 0) {
        throw new RunnerFailure(
          memberSelector
            ? `Ese miembro no tiene ningún hábito compartido en el círculo todavía, así que no hay nada que corregir.`
            : `No tienes ningún hábito compartido en el círculo todavía. Comparte uno (p.ej. "${habitQuery}") con circle_join y luego lo registro.`,
        );
      }
      const habit = await resolveHabitByName(habits, habitQuery, env, matchContext);

      // Optional `date` (YYYY-MM-DD) backdates a correction; the tracker caps how
      // far back and rejects future dates.
      const bodyObj: Record<string, unknown> = {};
      if (date) bodyObj["date"] = date;

      let endpoint: string;
      if (input["undo"] === true) {
        endpoint = `${base}/api/circles/${circleId}/members/${userId}/habits/${habit.habitId}/undo`;
      } else if (input["value"] !== undefined) {
        endpoint = `${base}/api/circles/${circleId}/members/${userId}/habits/${habit.habitId}/set-total`;
        bodyObj["total"] = input["value"];
      } else {
        endpoint = `${base}/api/circles/${circleId}/members/${userId}/habits/${habit.habitId}/complete`;
      }

      const body = Object.keys(bodyObj).length > 0 ? JSON.stringify(bodyObj) : undefined;
      const result = await postVoid(
        endpoint,
        {
          method: "POST",
          headers: circleAuth,
          ...(body !== undefined ? { body } : {}),
        },
        "No pude registrar el check-in",
      );
      return { status: "succeeded", output: result };
    }

    // ── Rename a member (owner-only): sets the member's display name ─────────
    if (tool === "circle_member_rename") {
      const memberSelector = (input["member"] as string | undefined) ?? "";
      const newName = (input["name"] as string | undefined) ?? "";
      if (!memberSelector || !newName) {
        throw new RunnerFailure("Necesito 'member' (a quién renombrar) y 'name' (el nuevo nombre).");
      }
      // SKILL.md promises 1–60 characters — enforce it instead of forwarding
      // an arbitrarily long hallucination to the tracker.
      if (newName.length > 60) {
        throw new RunnerFailure(
          `El nombre nuevo es demasiado largo (${newName.length} caracteres; máximo 60).`,
        );
      }
      const { members } = await requireCircleOwner(base, circleId!, circleToken!, identityId);
      const target = resolveTargetMember(members, memberSelector);
      const result = await postVoid(
        `${base}/api/circles/${circleId}/members/${target.userId}/name`,
        {
          method: "PATCH",
          headers: circleAuth,
          body: JSON.stringify({ name: newName }),
        },
        "No pude renombrar el miembro",
      );
      return { status: "succeeded", output: result };
    }

    if (tool === "circle_undo") {
      const habitQuery = (input["habit"] as string | undefined) ?? "";
      if (!habitQuery) {
        throw new RunnerFailure(
          "Dime qué hábito quieres deshacer — el círculo deshace registro por hábito, no en bloque.",
        );
      }
      const userId = await resolveMemberUserId(base, circleId!, circleToken!, identityId);
      const habits = await fetchMemberHabits(base, circleId!, userId, circleAuth);
      const habit = await resolveHabitByName(habits, habitQuery, env, matchContext);
      const result = await postVoid(
        `${base}/api/circles/${circleId}/members/${userId}/habits/${habit.habitId}/undo`,
        { method: "POST", headers: circleAuth },
        "No pude deshacer el check-in",
      );
      return { status: "succeeded", output: result };
    }

    // ── Sharing: caller's PERSONAL token (shares one of their own habits) ────
    if (tool === "circle_join") {
      const personalToken = env.MIKOSHI_TRACKER_PERSONAL_TOKEN;
      if (!personalToken) needsEnrolment();
      const personalAuth: Record<string, string> = {
        Authorization: `Bearer ${personalToken}`,
        "Content-Type": "application/json",
      };

      const habitQuery = (input["habit"] as string | undefined) ?? "";
      if (!habitQuery) {
        throw new RunnerFailure("El parámetro 'habit' es obligatorio para circle_join.");
      }
      const { items: personalHabits } = await fetchJson<{ items: PersonalHabit[] }>(
        `${base}/api/habits`,
        { headers: personalAuth },
        "No pude leer tus hábitos personales",
      );
      const habit = await resolveHabitByName(personalHabits, habitQuery, env, matchContext);
      const result = await postVoid(
        `${base}/api/circles/${circleId}/shares`,
        {
          method: "POST",
          headers: personalAuth,
          body: JSON.stringify({ habitId: habit.id }),
        },
        "No pude compartir el hábito en el círculo",
      );
      return { status: "succeeded", output: result };
    }

    throw new RunnerFailure(`Unknown tool: ${tool}`);
  } catch (err) {
    if (err instanceof RunnerFailure) {
      const out: CircleResult = { status: "failed", error: err.message };
      if (err.provider) out.provider = err.provider;
      return out;
    }
    throw err;
  }
}
