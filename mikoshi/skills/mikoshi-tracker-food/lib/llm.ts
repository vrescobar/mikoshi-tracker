/**
 * mikoshi-tracker-food — LLM proxy client.
 *
 * Replaces the direct calls to api.anthropic.com. The skill subprocess
 * talks to mikoshi's internal proxy (`/api/v1/internal/skill-llm`) which
 * dispatches to whichever runtime is configured for the task tier
 * (`skill.text` or `skill.vision`). Auth via a bearer token injected by
 * SkillToolExecutor as MIKOSHI_LLM_PROXY_TOKEN.
 *
 * The env vars MIKOSHI_LLM_PROXY_URL and MIKOSHI_LLM_PROXY_TOKEN come from
 * the SecretStore (declared in the skill manifest as optional secrets).
 */

export type SkillTaskKey = "skill.text" | "skill.vision";

export interface LlmProxyEnv {
  MIKOSHI_LLM_PROXY_URL?: string;
  MIKOSHI_LLM_PROXY_TOKEN?: string;
}

export interface LlmProxyTextRequest {
  taskKey: "skill.text";
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface LlmProxyVisionRequest {
  taskKey: "skill.vision";
  prompt: string;
  image: { base64: string; mimeType: string };
  systemPrompt?: string;
  maxTokens?: number;
}

export type LlmProxyRequest = LlmProxyTextRequest | LlmProxyVisionRequest;

interface LlmProxyResponse {
  text: string;
  tier: string;
  attempts: unknown[];
}

const DEFAULT_PROXY_URL = "http://127.0.0.1:7777/api/v1/internal/skill-llm";

export class LlmProxyError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "LlmProxyError";
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

export async function callLlmProxy(
  env: LlmProxyEnv,
  req: LlmProxyRequest,
): Promise<string> {
  const url = env.MIKOSHI_LLM_PROXY_URL || DEFAULT_PROXY_URL;
  const token = env.MIKOSHI_LLM_PROXY_TOKEN;
  if (!token) {
    throw new LlmProxyError(
      "MIKOSHI_LLM_PROXY_TOKEN missing — proxy bearer not provisioned",
      { code: "missing_token" },
    );
  }

  const body: Record<string, unknown> = {
    taskKey: req.taskKey,
    prompt: req.prompt,
  };
  if (req.systemPrompt) body["systemPrompt"] = req.systemPrompt;
  if (req.maxTokens) body["maxTokens"] = req.maxTokens;
  if (req.taskKey === "skill.vision") {
    body["image"] = req.image;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new LlmProxyError(`Proxy unreachable: ${reason}`, { code: "unreachable" });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmProxyError(
      `Proxy HTTP ${res.status}: ${text.slice(0, 300)}`,
      { status: res.status },
    );
  }

  const data = (await res.json()) as LlmProxyResponse;
  return data.text ?? "";
}

/**
 * Extract a JSON object embedded in free-form text (e.g. a markdown-fenced
 * response). Returns null when no balanced `{…}` block parses cleanly.
 */
export function safeParseJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match || !match[0]) return null;
  try {
    return JSON.parse(match[0]) as unknown;
  } catch {
    return null;
  }
}
