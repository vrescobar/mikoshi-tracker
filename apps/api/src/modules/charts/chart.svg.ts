/**
 * Pure SVG builders for the server-rendered charts delivered over WhatsApp.
 * Kept free of any rasterizer dependency so the PNG backend (sharp today,
 * resvg if ever needed) can be swapped without touching chart shapes. Colours
 * mirror the web design tokens: teal for habit/system, clay for nutrition.
 */

const W = 900;
const H = 480;
const PAD = { top: 64, right: 48, bottom: 64, left: 64 };
const COLORS = {
  canvas: "#f3f6f7",
  surface: "#ffffff",
  text: "#192127",
  muted: "#5a6670",
  border: "#cdd7db",
  diet: "#a8743f",
  dietSoft: "#f1e4d6",
  protein: "#2f6957",
  carbs: "#a8743f",
  fat: "#346079",
  target: "#8a3941",
};

const FONT =
  "font-family='Manrope, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function frame(title: string, subtitle: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="28" fill="${COLORS.canvas}"/>
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="22" fill="${COLORS.surface}" stroke="${COLORS.border}"/>
  <text x="${PAD.left}" y="48" ${FONT} font-size="26" font-weight="700" fill="${COLORS.text}">${esc(title)}</text>
  <text x="${PAD.left}" y="74" ${FONT} font-size="15" fill="${COLORS.muted}">${esc(subtitle)}</text>
  ${body}
</svg>`;
}

export type TrendPoint = { label: string; value: number };

/**
 * A calm line chart of a daily series (e.g. kcal), with an optional dashed
 * target line. Empty series render an explicit "no data" note rather than a
 * broken axis.
 */
export function kcalTrendSvg(params: {
  title: string;
  subtitle: string;
  points: TrendPoint[];
  target?: number | null;
  unit?: string;
}): string {
  const { points, target } = params;
  const plotX = PAD.left;
  const plotY = PAD.top + 24;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - plotY - PAD.bottom;

  if (points.length === 0) {
    return frame(
      params.title,
      params.subtitle,
      `<text x="${W / 2}" y="${H / 2}" ${FONT} font-size="18" fill="${COLORS.muted}" text-anchor="middle">No data in this range yet.</text>`,
    );
  }

  const maxValue = Math.max(target ?? 0, ...points.map((p) => p.value), 1);
  const niceMax = Math.ceil(maxValue / 100) * 100;
  const x = (i: number) => plotX + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => plotY + plotH - (v / niceMax) * plotH;

  // Horizontal gridlines + axis labels (4 steps).
  let grid = "";
  for (let s = 0; s <= 4; s += 1) {
    const gv = (niceMax / 4) * s;
    const gy = y(gv);
    grid += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="${COLORS.border}" stroke-width="1"/>`;
    grid += `<text x="${plotX - 10}" y="${gy + 4}" ${FONT} font-size="12" fill="${COLORS.muted}" text-anchor="end">${Math.round(gv)}</text>`;
  }

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${plotY + plotH} L ${x(0).toFixed(1)} ${plotY + plotH} Z`;
  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="${COLORS.diet}"/>`)
    .join("");

  // X labels: thin them out so they don't collide on long ranges.
  const step = Math.ceil(points.length / 7);
  const xLabels = points
    .map((p, i) =>
      i % step === 0
        ? `<text x="${x(i).toFixed(1)}" y="${plotY + plotH + 22}" ${FONT} font-size="11" fill="${COLORS.muted}" text-anchor="middle">${esc(p.label)}</text>`
        : "",
    )
    .join("");

  const targetLine =
    typeof target === "number" && target > 0
      ? `<line x1="${plotX}" y1="${y(target)}" x2="${plotX + plotW}" y2="${y(target)}" stroke="${COLORS.target}" stroke-width="2" stroke-dasharray="6 5"/>
         <text x="${plotX + plotW}" y="${y(target) - 8}" ${FONT} font-size="12" fill="${COLORS.target}" text-anchor="end">target ${Math.round(target)}</text>`
      : "";

  const body = `${grid}
  <path d="${area}" fill="${COLORS.dietSoft}" opacity="0.6"/>
  <path d="${line}" fill="none" stroke="${COLORS.diet}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  ${targetLine}
  ${xLabels}`;
  return frame(params.title, params.subtitle, body);
}

export type MacroSlice = { label: string; grams: number; kcalPerGram: number; color: string };

/**
 * A macro-composition donut sized by each macro's energy share
 * (protein/carbs ×4, fat ×9 kcal per gram), with a legend and centred total.
 */
export function macroDonutSvg(params: {
  title: string;
  subtitle: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): string {
  const slices: MacroSlice[] = [
    { label: "Protein", grams: params.protein_g, kcalPerGram: 4, color: COLORS.protein },
    { label: "Carbs", grams: params.carbs_g, kcalPerGram: 4, color: COLORS.carbs },
    { label: "Fat", grams: params.fat_g, kcalPerGram: 9, color: COLORS.fat },
  ];
  const energy = slices.map((s) => s.grams * s.kcalPerGram);
  const totalEnergy = energy.reduce((a, b) => a + b, 0);

  const cx = 300;
  const cy = 270;
  const r = 130;
  const inner = 78;

  if (totalEnergy <= 0) {
    return frame(
      params.title,
      params.subtitle,
      `<text x="${W / 2}" y="${H / 2}" ${FONT} font-size="18" fill="${COLORS.muted}" text-anchor="middle">No macros logged in this range yet.</text>`,
    );
  }

  let angle = -Math.PI / 2;
  let arcs = "";
  slices.forEach((s, i) => {
    const frac = energy[i] / totalEnergy;
    if (frac <= 0) return;
    const end = angle + frac * Math.PI * 2;
    const large = end - angle > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(angle);
    const y0 = cy + r * Math.sin(angle);
    const x1 = cx + r * Math.cos(end);
    const y1 = cy + r * Math.sin(end);
    arcs += `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L ${cx} ${cy} Z" fill="${s.color}"/>`;
    angle = end;
  });
  // Punch the hole to make it a donut.
  arcs += `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="${COLORS.surface}"/>`;
  arcs += `<text x="${cx}" y="${cy - 4}" ${FONT} font-size="30" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${Math.round(totalEnergy)}</text>`;
  arcs += `<text x="${cx}" y="${cy + 22}" ${FONT} font-size="14" fill="${COLORS.muted}" text-anchor="middle">kcal</text>`;

  // Legend on the right.
  let legend = "";
  const lx = 560;
  let ly = 210;
  slices.forEach((s, i) => {
    const pct = Math.round((energy[i] / totalEnergy) * 100);
    legend += `<rect x="${lx}" y="${ly - 14}" width="18" height="18" rx="5" fill="${s.color}"/>`;
    legend += `<text x="${lx + 28}" y="${ly}" ${FONT} font-size="18" fill="${COLORS.text}">${s.label}</text>`;
    legend += `<text x="${lx + 28}" y="${ly + 22}" ${FONT} font-size="14" fill="${COLORS.muted}">${Math.round(s.grams)} g · ${pct}%</text>`;
    ly += 58;
  });

  return frame(params.title, params.subtitle, `${arcs}${legend}`);
}
