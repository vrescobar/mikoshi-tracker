/**
 * MikoshiTracker personal skill runner.
 *
 * Reads { tool, input, workspaceDir, caller } from stdin (JSON envelope).
 * Core logic lives in ./lib.ts (importable in-process by tests).
 */
import {
  runMikoshiTrackerPersonal,
  type PersonalEnvelope,
  type PersonalResult,
} from "./lib.js";

function writeOutput(out: PersonalResult): void {
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  let envelope: PersonalEnvelope;
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString()) as PersonalEnvelope;
  } catch {
    writeOutput({ status: "failed", error: "Invalid JSON envelope on stdin" });
    process.exit(0);
  }

  const result = await runMikoshiTrackerPersonal(envelope, {
    MIKOSHI_TRACKER_PERSONAL_TOKEN: process.env["MIKOSHI_TRACKER_PERSONAL_TOKEN"],
    MIKOSHI_TRACKER_API_URL: process.env["MIKOSHI_TRACKER_API_URL"],
    MIKOSHI_LLM_PROXY_URL: process.env["MIKOSHI_LLM_PROXY_URL"],
    MIKOSHI_LLM_PROXY_TOKEN: process.env["MIKOSHI_LLM_PROXY_TOKEN"],
  });
  writeOutput(result);
}

await main();
