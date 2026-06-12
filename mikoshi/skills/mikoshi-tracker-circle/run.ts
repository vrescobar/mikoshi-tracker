/**
 * MikoshiTracker Circle skill runner — personal-token model.
 *
 * Reads { tool, input, workspaceDir, caller } from stdin (JSON envelope).
 * Core logic lives in ./lib.ts (importable in-process by tests).
 */
import { runMikoshiTrackerCircle, type CircleEnvelope, type CircleResult } from "./lib.js";

function writeOutput(out: CircleResult): void {
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  let envelope: CircleEnvelope;
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString()) as CircleEnvelope;
  } catch {
    writeOutput({ status: "failed", error: "Invalid JSON envelope on stdin" });
    process.exit(0);
  }

  const result = await runMikoshiTrackerCircle(envelope, {
    MIKOSHI_TRACKER_PERSONAL_TOKEN: process.env["MIKOSHI_TRACKER_PERSONAL_TOKEN"],
    MIKOSHI_TRACKER_CIRCLE_TOKEN: process.env["MIKOSHI_TRACKER_CIRCLE_TOKEN"],
    MIKOSHI_TRACKER_CIRCLE_ID: process.env["MIKOSHI_TRACKER_CIRCLE_ID"],
    MIKOSHI_TRACKER_CIRCLE_API_URL: process.env["MIKOSHI_TRACKER_CIRCLE_API_URL"],
    MIKOSHI_LLM_PROXY_URL: process.env["MIKOSHI_LLM_PROXY_URL"],
    MIKOSHI_LLM_PROXY_TOKEN: process.env["MIKOSHI_LLM_PROXY_TOKEN"],
  });
  writeOutput(result);
}

await main();
