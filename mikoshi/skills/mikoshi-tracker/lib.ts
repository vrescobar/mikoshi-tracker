/**
 * MikoshiTracker personal skill — core logic, importable in-process.
 *
 * run.ts is a thin stdin/stdout shim around runMikoshiTrackerPersonal().
 */

import { resolveHabit, type HabitLike } from "../mikoshi-tracker-shared/habitMatch.js";

export interface CallerInfo {
  identityId?: string;
  jid?: string;
  displayName?: string;
}

export interface PersonalEnvelope {
  tool: string;
  input: Record<string, unknown>;
  workspaceDir?: string;
  caller?: CallerInfo;
}

export interface PersonalEnv {
  MIKOSHI_TRACKER_PERSONAL_TOKEN?: string;
  MIKOSHI_TRACKER_API_URL?: string;
  // Skill-LLM-proxy (optional): enables contextual habit matching. Injected by
  // SkillToolExecutor from the optional manifest secrets.
  MIKOSHI_LLM_PROXY_URL?: string;
  MIKOSHI_LLM_PROXY_TOKEN?: string;
}

export type PersonalResult =
  | { status: "succeeded"; output: unknown }
  | { status: "failed"; error: string; provider?: string };

class RunnerFailure extends Error {
  readonly provider?: string;
  constructor(message: string, provider?: string) {
    super(message);
    this.provider = provider;
  }
}

const ID_REGEX = /^[a-z0-9]{20,}$/;

interface HabitItem extends HabitLike {
  id: string;
  name: string;
  kind?: string;
  unit?: string | null;
  targetValue?: number | null;
  isActive?: boolean;
  /**
   * Circles this habit is shared into. Backend enrichment (degrades to absent):
   * lets archive warn the user that archiving drops it from those contests.
   */
  sharedInCircles?: Array<{ circleId: string; name: string }>;
}

interface HabitListResponse {
  items: HabitItem[];
}

async function apiFetch(
  url: string,
  opts: RequestInit,
  label: string,
): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new RunnerFailure(`${label}: ${msg}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new RunnerFailure(`${r.status} ${body}`);
  }
  return (await r.json()) as unknown;
}

async function fetchHabitCandidates(
  apiBase: string,
  authHeaders: Record<string, string>,
  status: "active" | "archived",
): Promise<HabitItem[]> {
  // We fetch ALL habits of the given status (no `query` filter) so the
  // contextual matcher can disambiguate over the full list, not just whatever
  // the backend's substring search happened to return.
  const qs = new URLSearchParams({ status });
  let r: Response;
  try {
    r = await fetch(`${apiBase}/habits?${qs.toString()}`, { headers: authHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new RunnerFailure(`habits lookup: ${msg}`);
  }
  if (!r.ok) throw new RunnerFailure("No pude leer tus hábitos.");
  const data = (await r.json()) as HabitListResponse;
  return data.items ?? [];
}

/**
 * Resolve a (possibly paraphrased / indirect) habit reference to the full habit
 * object. Layered: raw-ID fast-path → shared contextual matcher over the full
 * candidate list (accent/substring → LLM with `context`) → actionable error
 * that lists the habits with friendly descriptors so the agent can explain and
 * ask. Returns the rich item (id + metadata + circle membership) so callers can
 * narrate consequential changes (e.g. archiving a circle-shared habit).
 */
async function resolveHabitItem(
  apiBase: string,
  authHeaders: Record<string, string>,
  env: PersonalEnv,
  habitQuery: string,
  opts: { context?: string; status?: "active" | "archived" } = {},
): Promise<HabitItem> {
  // Raw-ID fast-path: skip the list fetch entirely. (The follow-up API call
  // already validates the id; enrichment like sharedInCircles isn't available
  // for a bare id, which is fine — the LLM passes a name in the common case.)
  if (ID_REGEX.test(habitQuery)) {
    return { id: habitQuery, name: habitQuery };
  }

  const status = opts.status ?? "active";
  const candidates = await fetchHabitCandidates(apiBase, authHeaders, status);
  const outcome = await resolveHabit(candidates, habitQuery, env, { context: opts.context });
  if (!outcome.ok) throw new RunnerFailure(outcome.error);
  return outcome.habit;
}

export async function runMikoshiTrackerPersonal(
  envelope: PersonalEnvelope,
  env: PersonalEnv,
): Promise<PersonalResult> {
  try {
    const personalToken = env.MIKOSHI_TRACKER_PERSONAL_TOKEN;
    if (!personalToken) {
      throw new RunnerFailure("needs-enrolment", "mikoshi-tracker");
    }

    const apiBase = (env.MIKOSHI_TRACKER_API_URL ?? "http://localhost:7080/api").replace(/\/$/, "");
    const authHeaders: Record<string, string> = {
      Authorization: `Bearer ${personalToken}`,
      "Content-Type": "application/json",
    };

    const { tool, input } = envelope;

    if (tool === "habits_list") {
      const qs = new URLSearchParams();
      if (input["status"]) qs.set("status", String(input["status"]));
      if (input["query"]) qs.set("query", String(input["query"]));
      if (input["category"]) qs.set("category", String(input["category"]));
      if (input["kind"]) qs.set("kind", String(input["kind"]));
      const qstr = qs.toString();
      const output = await apiFetch(
        `${apiBase}/habits${qstr ? `?${qstr}` : ""}`,
        { headers: authHeaders },
        "habits_list",
      );
      return { status: "succeeded", output };
    }

    if (tool === "habits_add") {
      const output = await apiFetch(
        `${apiBase}/habits`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(input) },
        "habits_add",
      );
      return { status: "succeeded", output };
    }

    const matchContext = input["context"] != null ? String(input["context"]) : undefined;

    if (tool === "habits_get_detail") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const output = await apiFetch(
        `${apiBase}/habits/${encodeURIComponent(habit.id)}`,
        { headers: authHeaders },
        "habits_get_detail",
      );
      return { status: "succeeded", output };
    }

    if (tool === "habits_edit") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const output = await apiFetch(
        `${apiBase}/habits/${encodeURIComponent(habit.id)}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(input["patch"] ?? {}),
        },
        "habits_edit",
      );
      return { status: "succeeded", output };
    }

    if (tool === "habits_archive") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const result = await apiFetch(
        `${apiBase}/habits/${encodeURIComponent(habit.id)}/archive`,
        { method: "POST", headers: authHeaders },
        "habits_archive",
      );
      // Surface the consequential side-effect: archiving drops the habit from any
      // circle contest it was shared into. Only present when it actually was.
      const sharedNames = (habit.sharedInCircles ?? []).map((c) => c.name);
      const output: Record<string, unknown> = { result };
      if (sharedNames.length > 0) output["wasSharedInCircles"] = sharedNames;
      return { status: "succeeded", output };
    }

    if (tool === "habits_restore") {
      // Restore acts on an ARCHIVED habit, so match over the archived list.
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
        status: "archived",
      });
      const output = await apiFetch(
        `${apiBase}/habits/${encodeURIComponent(habit.id)}/restore`,
        { method: "POST", headers: authHeaders },
        "habits_restore",
      );
      return { status: "succeeded", output };
    }

    if (tool === "today_get_summary") {
      const output = await apiFetch(`${apiBase}/today`, { headers: authHeaders }, "today_get_summary");
      return { status: "succeeded", output };
    }

    if (tool === "today_complete") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const habitId = habit.id;
      const body: Record<string, unknown> = { habitId, source: "ai" };
      if (input["note"] != null) body["note"] = input["note"];
      const output = await apiFetch(
        `${apiBase}/today/complete`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(body) },
        "today_complete",
      );
      return { status: "succeeded", output };
    }

    if (tool === "today_set_total") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const habitId = habit.id;
      const body: Record<string, unknown> = { habitId, total: input["total"], source: "ai" };
      if (input["note"] != null) body["note"] = input["note"];
      const output = await apiFetch(
        `${apiBase}/today/set-total`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(body) },
        "today_set_total",
      );
      return { status: "succeeded", output };
    }

    if (tool === "today_undo") {
      const habit = await resolveHabitItem(apiBase, authHeaders, env, String(input["habit"] ?? ""), {
        context: matchContext,
      });
      const habitId = habit.id;
      const body: Record<string, unknown> = { habitId, source: "ai" };
      if (input["note"] != null) body["note"] = input["note"];
      const output = await apiFetch(
        `${apiBase}/today/undo`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(body) },
        "today_undo",
      );
      return { status: "succeeded", output };
    }

    if (tool === "stats_get_overview") {
      const output = await apiFetch(
        `${apiBase}/stats/overview`,
        { headers: authHeaders },
        "stats_get_overview",
      );
      return { status: "succeeded", output };
    }

    throw new RunnerFailure(`Unknown tool: ${tool}`);
  } catch (err) {
    if (err instanceof RunnerFailure) {
      const out: PersonalResult = { status: "failed", error: err.message };
      if (err.provider) out.provider = err.provider;
      return out;
    }
    throw err;
  }
}
