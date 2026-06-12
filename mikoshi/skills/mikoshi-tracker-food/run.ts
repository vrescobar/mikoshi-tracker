/**
 * mikoshi-tracker-food skill runner.
 *
 * Reads { tool, input, workspaceDir, caller } from stdin (JSON envelope).
 * Core logic lives in ./lib/tiers.ts (importable in-process by tests).
 */
import { runFoodSkill, type FoodEnvelope, type FoodResult } from "./lib/tiers.js";

function writeOutput(out: FoodResult): void {
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  let envelope: FoodEnvelope;
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString()) as FoodEnvelope;
  } catch {
    writeOutput({ status: "failed", error: "Invalid JSON envelope on stdin" });
    process.exit(0);
  }

  const result = await runFoodSkill(envelope, {
    MIKOSHI_TRACKER_PERSONAL_TOKEN: process.env["MIKOSHI_TRACKER_PERSONAL_TOKEN"],
    MIKOSHI_TRACKER_API_URL: process.env["MIKOSHI_TRACKER_API_URL"],
    MIKOSHI_LLM_PROXY_URL: process.env["MIKOSHI_LLM_PROXY_URL"],
    MIKOSHI_LLM_PROXY_TOKEN: process.env["MIKOSHI_LLM_PROXY_TOKEN"],
    BRAVE_SEARCH_API_KEY: process.env["BRAVE_SEARCH_API_KEY"],
  });

  writeOutput(result);
}

await main();
