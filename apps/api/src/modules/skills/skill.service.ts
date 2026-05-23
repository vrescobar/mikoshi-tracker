import type { PrismaClient } from "../../generated/prisma/client";

// ─── Error classes ─────────────────────────────────────────────────────────────

export class SkillNotRegisteredError extends Error {
  constructor(slug: string) {
    super(`Skill not registered: ${slug}`);
    this.name = "SkillNotRegisteredError";
  }
}

export class SkillRunnerUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillRunnerUnreachableError";
  }
}

export class SkillRunnerTimeoutError extends Error {
  constructor() {
    super("Skill runner timed out");
    this.name = "SkillRunnerTimeoutError";
  }
}

export class SkillRunnerError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "SkillRunnerError";
  }
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_RUNNER_URL = "http://localhost:7990";
const DEFAULT_TIMEOUT_MS = 30_000;

export function getRunnerUrl(): string {
  return process.env.MIKOSHI_SKILL_RUNNER_URL ?? DEFAULT_RUNNER_URL;
}

// ─── Public service ────────────────────────────────────────────────────────────

/**
 * Resolve the allow-list of skill slugs the tracker is willing to invoke. Only
 * EntryTypes that declare a `skillSlug` qualify; this prevents callers from
 * driving arbitrary skills through the bridge.
 */
export async function listAllowedSkillSlugs(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.entryType.findMany({
    where: { skillSlug: { not: null } },
    select: { skillSlug: true },
  });
  return new Set(rows.map((r) => r.skillSlug).filter((v): v is string => Boolean(v)));
}

/** Spawn the skill via HTTP, return its parsed JSON output. */
export async function runSkill(
  db: PrismaClient,
  params: { skillSlug: string; input: unknown; userId: string },
): Promise<unknown> {
  const { skillSlug, input, userId } = params;

  const allowed = await listAllowedSkillSlugs(db);
  if (!allowed.has(skillSlug)) {
    throw new SkillNotRegisteredError(skillSlug);
  }

  const url = `${getRunnerUrl().replace(/\/$/, "")}/skills/${encodeURIComponent(skillSlug)}/run`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ skillSlug, input, userId }),
      signal: ac.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new SkillRunnerError(text || `Runner returned ${response.status}`, response.status);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SkillRunnerError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SkillRunnerTimeoutError();
    }
    throw new SkillRunnerUnreachableError(
      error instanceof Error ? error.message : "Unable to reach the skill runner",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Proxy GET <runner>/skills/<slug>/health and return its body. */
export async function getSkillHealth(
  db: PrismaClient,
  params: { skillSlug: string },
): Promise<unknown> {
  const { skillSlug } = params;

  const allowed = await listAllowedSkillSlugs(db);
  if (!allowed.has(skillSlug)) {
    throw new SkillNotRegisteredError(skillSlug);
  }

  const url = `${getRunnerUrl().replace(/\/$/, "")}/skills/${encodeURIComponent(skillSlug)}/health`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: ac.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new SkillRunnerError(text || `Runner returned ${response.status}`, response.status);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SkillRunnerError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SkillRunnerTimeoutError();
    }
    throw new SkillRunnerUnreachableError(
      error instanceof Error ? error.message : "Unable to reach the skill runner",
    );
  } finally {
    clearTimeout(timer);
  }
}
