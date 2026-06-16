/**
 * mikoshi-tracker-report skill runner.
 *
 * Reads { tool, input } from stdin (JSON envelope) and renders + delivers a
 * nutrition chart to the issuer's WhatsApp DM by calling the tracker's
 * POST /api/v1/reports/chart with the issuer's personal token. The tracker
 * renders the PNG and performs the platform notify, so the chart bytes and the
 * token never leave the tracker's trust boundary — this skill only orchestrates.
 */

type ReportEnvelope = {
  tool?: string;
  input?: {
    kind?: string;
    range?: string;
    caption?: string;
  };
};

type ReportResult =
  | { status: "ok"; delivered: boolean; reason?: string }
  | { status: "failed"; error: string };

const VALID_KINDS = new Set(["kcal-trend", "macro-donut"]);
const VALID_RANGES = new Set(["7d", "30d", "90d"]);

function writeOutput(out: ReportResult): void {
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  let envelope: ReportEnvelope;
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString()) as ReportEnvelope;
  } catch {
    writeOutput({ status: "failed", error: "Invalid JSON envelope on stdin" });
    process.exit(0);
  }

  if (envelope.tool && envelope.tool !== "report_send_chart") {
    writeOutput({ status: "failed", error: `Herramienta desconocida: ${envelope.tool}` });
    process.exit(0);
  }

  const token = process.env["MIKOSHI_TRACKER_PERSONAL_TOKEN"];
  if (!token) {
    writeOutput({
      status: "failed",
      error:
        "missing-token: MIKOSHI_TRACKER_PERSONAL_TOKEN. El informe necesita el token " +
        "personal del emisor; el runtime de mikoshi lo provisiona al conectar.",
    });
    process.exit(0);
  }

  const apiBase = (process.env["MIKOSHI_TRACKER_API_URL"] ?? "http://localhost:7080/api").replace(/\/$/, "");
  const kind = envelope.input?.kind ?? "kcal-trend";
  const range = envelope.input?.range;

  if (!VALID_KINDS.has(kind)) {
    writeOutput({ status: "failed", error: `kind inválido: ${kind} (usa kcal-trend o macro-donut)` });
    process.exit(0);
  }
  if (range !== undefined && !VALID_RANGES.has(range)) {
    writeOutput({ status: "failed", error: `range inválido: ${range} (usa 7d, 30d o 90d)` });
    process.exit(0);
  }

  try {
    const response = await fetch(`${apiBase}/v1/reports/chart`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        ...(range ? { range } : {}),
        ...(envelope.input?.caption ? { caption: envelope.input.caption } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: { delivered?: boolean; reason?: string };
      error?: string;
    };
    if (!response.ok || body.ok !== true || !body.data) {
      writeOutput({ status: "failed", error: body.error ?? `La API respondió ${response.status}` });
      process.exit(0);
    }
    writeOutput({
      status: "ok",
      delivered: Boolean(body.data.delivered),
      ...(body.data.reason ? { reason: body.data.reason } : {}),
    });
  } catch (err) {
    writeOutput({
      status: "failed",
      error: err instanceof Error ? err.message : "Error inesperado al enviar el informe",
    });
  }
}

await main();
