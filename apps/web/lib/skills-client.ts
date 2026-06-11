import { apiFetch } from "./http";

export type SkillHealthSnapshot = {
  skillSlug: string;
  enrolled: boolean | null;
  lastRunAt: string | null;
  lastError: string | null;
  unreachable: boolean;
};

/**
 * Fetch the skill runner's health for a single slug via the API proxy. Maps
 * 502/503/504 (runner unreachable/timeout) — and any other failure — to
 * `unreachable: true` so the settings page can show a graceful state instead
 * of throwing.
 */
export async function getSkillHealth(slug: string): Promise<SkillHealthSnapshot> {
  const unreachable: SkillHealthSnapshot = {
    skillSlug: slug,
    enrolled: null,
    lastRunAt: null,
    lastError: null,
    unreachable: true,
  };

  let response: Response;
  try {
    response = await apiFetch(`/api/skills/${encodeURIComponent(slug)}/health`);
  } catch {
    return unreachable;
  }

  if (!response.ok) {
    return unreachable;
  }

  const body = (await response.json()) as {
    skillSlug?: string;
    enrolled?: boolean;
    lastRunAt?: string | null;
    lastError?: string | null;
  };
  return {
    skillSlug: body.skillSlug ?? slug,
    enrolled: body.enrolled ?? null,
    lastRunAt: body.lastRunAt ?? null,
    lastError: body.lastError ?? null,
    unreachable: false,
  };
}
