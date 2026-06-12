/**
 * Shared skill-LLM-proxy client for the MikoshiTracker habit skills
 * (`mikoshi-tracker`, `mikoshi-tracker-circle`).
 *
 * A skill subprocess can't call an LLM provider directly; it talks to Mikoshi's
 * internal proxy (`/api/v1/internal/skill-llm`), which dispatches to whichever
 * runtime is configured for the `skill.text` task tier. Auth is a bearer token
 * injected by SkillToolExecutor as MIKOSHI_LLM_PROXY_TOKEN (declared as an
 * optional secret in each skill manifest).
 *
 * Both habit skills import this via a relative path; the food skill keeps its
 * own copy (it also needs vision and is out of scope here).
 */

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

/**
 * True when the proxy is configured enough to attempt a call. Lets callers skip
 * the LLM path and degrade to deterministic matching without throwing.
 */
export function llmProxyAvailable(env: LlmProxyEnv): boolean {
  return Boolean(env.MIKOSHI_LLM_PROXY_TOKEN);
}

export async function callLlmProxy(
  env: LlmProxyEnv,
  req: LlmProxyTextRequest,
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
    throw new LlmProxyError(`Proxy HTTP ${res.status}: ${text.slice(0, 300)}`, {
      status: res.status,
    });
  }

  const data = (await res.json()) as LlmProxyResponse;
  return data.text ?? "";
}

/**
 * Extract the first balanced `{…}` JSON object embedded in free-form text (the
 * LLM may wrap it in prose or a markdown fence). Returns null on no clean parse.
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
