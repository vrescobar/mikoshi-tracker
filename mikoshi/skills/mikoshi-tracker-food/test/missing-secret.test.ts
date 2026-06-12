/**
 * Regression tests for the missing-secret guard at the top of `runFoodSkill`.
 *
 * History:
 *  - 2026-05-25 ("huevo duro"): el skill declaraba `anthropic_api_key` como
 *    **required**, y `SkillToolExecutor` cortaba antes de spawn con un mensaje
 *    genérico. Lo resolvimos haciendo el secret opcional y poniendo un guard
 *    accionable dentro de `runFoodSkill`.
 *  - 2026-05-31 ("yufka"): retiramos del todo la dependencia de Anthropic. El
 *    skill ahora va por el **skill-LLM proxy** interno de mikoshi
 *    (`/api/v1/internal/skill-llm`), que dispatcha al tier configurado
 *    (`skill.text` / `skill.vision`). El guard pasa a verificar que el bearer
 *    `MIKOSHI_LLM_PROXY_TOKEN` esté presente (lo provisiona mikoshi al arrancar).
 *
 * Estos tests no spawnean subprocesos ni tocan ninguna API externa —
 * llaman `runFoodSkill` en proceso con `env` controlado.
 */
import { describe, test, expect } from "bun:test";
import { runFoodSkill, type FoodEnvelope } from "../lib/tiers.js";

const ENVELOPE: FoodEnvelope = {
  tool: "food_log_from_input",
  input: { input: "1 huevo duro", meal_slot: "other" },
  workspaceDir: "/tmp/missing-secret-test",
  caller: { identityId: "test-identity-victor", jid: "test@s.whatsapp.net" },
};

describe("mikoshi-tracker-food — missing-secret error path", () => {
  test("missing PERSONAL_TOKEN returns needs-enrolment", async () => {
    const result = await runFoodSkill(ENVELOPE, {
      MIKOSHI_TRACKER_PERSONAL_TOKEN: undefined,
      MIKOSHI_LLM_PROXY_TOKEN: "ignored-because-token-missing",
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBe("needs-enrolment");
    }
  });

  test("missing MIKOSHI_LLM_PROXY_TOKEN returns an actionable proxy-token error", async () => {
    const result = await runFoodSkill(ENVELOPE, {
      MIKOSHI_TRACKER_PERSONAL_TOKEN: "tok-test-victor",
      MIKOSHI_LLM_PROXY_TOKEN: undefined,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      // Load-bearing properties so the LLM can surface the message
      // verbatim and the operator knows what to do:
      //  1. "missing-proxy-token" — structured prefix the orchestrator
      //     and downstream tooling can pattern-match.
      //  2. "MIKOSHI_LLM_PROXY_TOKEN" — the exact env var name.
      //  3. mention of restarting mikoshi — where the token is provisioned.
      expect(result.error).toContain("missing-proxy-token");
      expect(result.error).toContain("MIKOSHI_LLM_PROXY_TOKEN");
      expect(result.error.toLowerCase()).toContain("reinicia");
    }
  });

  test("empty MIKOSHI_LLM_PROXY_TOKEN string is treated the same as undefined", async () => {
    const result = await runFoodSkill(ENVELOPE, {
      MIKOSHI_TRACKER_PERSONAL_TOKEN: "tok-test-victor",
      MIKOSHI_LLM_PROXY_TOKEN: "",
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toContain("missing-proxy-token");
    }
  });
});
