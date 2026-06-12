/**
 * Deterministic renderer for the circle weekly scoreboard card (PNG).
 *
 * This is PURE code — no LLM. The skill (`circle_card`) calls it; the runtime
 * sends the produced image as a separate WhatsApp message and pins it. Style is
 * the "neón / panceta a la izquierda" variant Víctor approved: the left badge is
 * a medal when you hit 100% or a bacon (panceta) with ×N missed sessions when you
 * don't. The bacon is a vector glyph (color emoji renders monochrome in sharp).
 */
import sharp from "sharp";

export interface CardRow {
  name: string;
  done: number;
  target: number;
  pct: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const colorFor = (p: number): string =>
  p >= 100 ? "#39ff14" : p >= 80 ? "#9bff3a" : p >= 50 ? "#ffd23f" : p >= 25 ? "#ff8a3d" : "#ff2e88";

/** Sessions a member missed this week — the canonical "panceta" unit (used by
 *  the row badges, the footer total, the summary and the donut). */
const missedOf = (r: CardRow): number => Math.max(0, r.target - r.done);
/** Total pancetas across the group = total missed sessions. */
const totalPancetas = (rows: CardRow[]): number => rows.reduce((s, r) => s + missedOf(r), 0);

/** Truncate an over-long name with an ellipsis so it never collides with the bar. */
function fitName(name: string, max = 18): string {
  const cp = [...name];
  return cp.length <= max ? name : cp.slice(0, max - 1).join("") + "…";
}

/** Vector bacon glyph (color-controlled; Noto color emoji renders grey in sharp). */
function bacon(x: number, y: number, s: number): string {
  return `<g transform="translate(${x},${y}) rotate(-18) scale(${s})">
    <path d="M-22,-8 Q-11,-12 0,-8 Q11,-4 22,-8 L22,8 Q11,12 0,8 Q-11,4 -22,8 Z" fill="#9e2b2b"/>
    <path d="M-22,-8 Q-11,-12 0,-8 Q11,-4 22,-8 L22,-3.5 Q11,-7.5 0,-3.5 Q-11,0.5 -22,-3.5 Z" fill="#f2d2bd"/>
    <path d="M-22,3.5 Q-11,-0.5 0,3.5 Q11,7.5 22,3.5 L22,8 Q11,12 0,8 Q-11,4 -22,8 Z" fill="#f2d2bd"/>
    <path d="M-22,-1 Q-11,-5 0,-1 Q11,3 22,-1 L22,1 Q11,5 0,1 Q-11,-3 -22,1 Z" fill="#d9663f"/>
  </g>`;
}

/** Sort rows the way the scoreboard ranks them: % desc, done desc, name asc. */
export function sortCardRows(rows: CardRow[]): CardRow[] {
  return [...rows].sort((a, b) => b.pct - a.pct || b.done - a.done || a.name.localeCompare(b.name));
}

function cardSVG(rows: CardRow[]): string {
  const W = 980;
  const topY = 150;
  const rowH = 62;
  const H = topY + rows.length * rowH + 70;
  const nameX = 90;
  const barX = 310;
  const barW = 540;
  const pctRight = W - 40;
  const p: string[] = [];
  p.push(`<rect width="${W}" height="${H}" fill="#0c0c12"/>`);
  p.push(`<rect x="0" y="0" width="${W}" height="6" fill="url(#grad)"/>`);
  p.push(`<text x="40" y="62" font-family="DejaVu Sans, sans-serif" font-size="40" font-weight="bold" fill="#00e5ff">PARTE SEMANAL</text>`);
  p.push(`<text x="40" y="100" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#ff2e88">Operación Bikini vs Operación Panceta</text>`);
  p.push(`<line x1="40" y1="125" x2="${W - 40}" y2="125" stroke="#23232e" stroke-width="2"/>`);
  rows.forEach((r, i) => {
    const y = topY + i * rowH;
    const cy = y + rowH / 2;
    const c = colorFor(r.pct);
    const fillW = Math.max(4, Math.round((r.pct / 100) * barW));
    const rank = i + 1;
    const bx = 42; // badge center
    if (r.pct >= 100) {
      const medalCol = rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : "#39ff14";
      p.push(`<circle cx="${bx}" cy="${cy}" r="18" fill="${medalCol}"/>`);
      p.push(`<text x="${bx}" y="${cy + 6}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="bold" fill="#0c0c12">${rank}</text>`);
    } else {
      const missed = Math.max(1, r.target - r.done);
      p.push(bacon(bx, cy - 4, 0.82));
      p.push(`<text x="${bx}" y="${cy + 20}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="bold" fill="#ff8a3d">×${missed}</text>`);
    }
    p.push(`<text x="${nameX}" y="${cy + 7}" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#f5f5fa">${esc(fitName(r.name))}</text>`);
    p.push(`<rect x="${barX}" y="${cy - 15}" width="${barW}" height="30" rx="15" fill="#191922"/>`);
    p.push(`<rect x="${barX}" y="${cy - 15}" width="${fillW}" height="30" rx="15" fill="${c}"/>`);
    p.push(`<text x="${barX + 14}" y="${cy + 6}" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#0c0c12" font-weight="bold">${r.done}/${r.target}</text>`);
    p.push(`<text x="${pctRight}" y="${cy + 7}" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="bold" fill="${c}">${r.pct}%</text>`);
  });
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0;
  const pancetas = totalPancetas(rows);
  p.push(`<text x="40" y="${H - 28}" font-family="DejaVu Sans, sans-serif" font-size="20" fill="#8a8a9a">Media del grupo: <tspan fill="#00e5ff" font-weight="bold">${avg}%</tspan>   ·   <tspan fill="#ff8a3d" font-weight="bold">${pancetas}</tspan> pancetas repartidas</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00e5ff"/><stop offset="1" stop-color="#ff2e88"/></linearGradient></defs>
    ${p.join("\n")}
  </svg>`;
}

/** Render the scoreboard card as a PNG buffer. Rows are sorted internally. */
export async function renderCircleCardPng(rows: CardRow[]): Promise<Buffer> {
  const svg = cardSVG(sortCardRows(rows));
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Compact text standings the LLM uses to write its commentary (one tool call). */
export function cardSummary(rows: CardRow[]): string {
  const sorted = sortCardRows(rows);
  const lines = sorted.map((r, i) => {
    const tag = r.pct >= 100 ? "✅" : `🥓×${missedOf(r)}`;
    return `${i + 1}. ${r.name} — ${r.done}/${r.target} (${r.pct}%) ${tag}`;
  });
  const avg = sorted.length ? Math.round(sorted.reduce((s, r) => s + r.pct, 0) / sorted.length) : 0;
  return `${lines.join("\n")}\nMedia del grupo: ${avg}% · ${totalPancetas(sorted)} pancetas`;
}

/** Shape of a circle leaderboard row as returned by the tracker API. */
interface LeaderboardApiRow {
  displayName: string;
  weeklyCompletedCount: number;
  weeklyTargetCount: number;
  weeklyCompletionRate: number;
}

/** Map a tracker `/leaderboard` response to the renderer's CardRow[]. Shared by
 *  the skill (on-demand) and the deterministic weekly-card service. */
export function mapLeaderboardRows(json: { leaderboard: LeaderboardApiRow[] }): CardRow[] {
  return json.leaderboard.map((r) => ({
    name: r.displayName,
    done: r.weeklyCompletedCount,
    target: r.weeklyTargetCount,
    pct: Math.round(r.weeklyCompletionRate * 100),
  }));
}

// ─── Group donut (collective progress gauge) ─────────────────────────────────

function donutSVG(rows: CardRow[]): string {
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const frac = totalTarget ? totalDone / totalTarget : 0;
  const pct = Math.round(frac * 100);
  const winners = rows.filter((r) => r.pct >= 100).length;
  const pancetas = totalPancetas(rows);
  const xp = rows.reduce((s, r) => s + r.done * 20 + (r.pct >= 100 ? 40 : 0), 0);
  const level = Math.floor(xp / 100);
  const ring = pct >= 80 ? "#39ff14" : pct >= 50 ? "#ffd23f" : pct >= 25 ? "#ff8a3d" : "#ff2e88";
  const W = 760;
  const H = 760;
  const cx = W / 2;
  const cy = 360;
  const R = 190;
  const SW = 56;
  const C = 2 * Math.PI * R;
  const dash = C * frac;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00e5ff"/><stop offset="1" stop-color="#ff2e88"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="#0c0c12"/>
    <rect x="0" y="0" width="${W}" height="6" fill="url(#grad)"/>
    <text x="${cx}" y="64" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="#00e5ff">PROGRESO DEL GRUPO</text>
    <text x="${cx}" y="98" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="20" fill="#ff2e88">Operación Bikini vs Operación Panceta</text>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#191922" stroke-width="${SW}"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${ring}" stroke-width="${SW}" stroke-linecap="round"
            stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" filter="url(#glow)"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="110" font-weight="bold" fill="#f5f5fa">${pct}%</text>
    <text x="${cx}" y="${cy + 40}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="26" fill="#8a8a9a">${totalDone}/${totalTarget} sesiones</text>
    <text x="${cx}" y="${cy + R + 110}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#8a8a9a"><tspan fill="#39ff14" font-weight="bold">${winners}</tspan> cumplen meta<tspan fill="#3a3a46">   ·   </tspan><tspan fill="#ff8a3d" font-weight="bold">${pancetas}</tspan> pancetas<tspan fill="#3a3a46">   ·   </tspan>Nivel <tspan fill="#00e5ff" font-weight="bold">${level}</tspan></text>
  </svg>`;
}

/** Render the group progress donut as a PNG buffer. */
export async function renderDonutPng(rows: CardRow[]): Promise<Buffer> {
  return sharp(Buffer.from(donutSVG(rows))).png().toBuffer();
}

/** Compact text for the donut's accompanying comment. */
export function donutSummary(rows: CardRow[]): string {
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const pct = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
  const winners = rows.filter((r) => r.pct >= 100).length;
  return `Progreso del grupo: ${totalDone}/${totalTarget} sesiones (${pct}%) · ${winners} cumplen meta · ${totalPancetas(rows)} pancetas`;
}
