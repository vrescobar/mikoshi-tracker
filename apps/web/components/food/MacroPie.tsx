import styles from "./MacroPie.module.css";

type Props = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  label: string;
  emptyLabel: string;
  legend: { protein: string; carbs: string; fat: string };
};

const SIZE = 160;
const RADIUS = 64;
const STROKE = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Atwater factors: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g.
function kcalShare(p: number, c: number, f: number): [number, number, number, number] {
  const proteinKcal = Math.max(p, 0) * 4;
  const carbsKcal = Math.max(c, 0) * 4;
  const fatKcal = Math.max(f, 0) * 9;
  const total = proteinKcal + carbsKcal + fatKcal;
  if (total <= 0) return [0, 0, 0, 0];
  return [proteinKcal / total, carbsKcal / total, fatKcal / total, total];
}

export function MacroPie({ proteinG, carbsG, fatG, label, emptyLabel, legend }: Props) {
  const [proteinPct, carbsPct, fatPct, totalKcal] = kcalShare(proteinG, carbsG, fatG);

  if (totalKcal === 0) {
    return (
      <div className={styles.empty} data-testid="macro-pie-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const proteinLen = proteinPct * CIRCUMFERENCE;
  const carbsLen = carbsPct * CIRCUMFERENCE;
  const fatLen = fatPct * CIRCUMFERENCE;

  // Stack arcs starting at the top (rotate -90deg via SVG transform).
  const proteinOffset = 0;
  const carbsOffset = -proteinLen;
  const fatOffset = -(proteinLen + carbsLen);

  const ariaSummary =
    `${legend.protein}: ${(proteinPct * 100).toFixed(0)}%, ` +
    `${legend.carbs}: ${(carbsPct * 100).toFixed(0)}%, ` +
    `${legend.fat}: ${(fatPct * 100).toFixed(0)}%`;

  return (
    <div className={styles.wrap} data-testid="macro-pie">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${label}. ${ariaSummary}`}
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--macro-protein, #6366f1)"
            strokeWidth={STROKE}
            strokeDasharray={`${proteinLen} ${CIRCUMFERENCE - proteinLen}`}
            strokeDashoffset={proteinOffset}
            data-testid="macro-pie-protein"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--macro-carbs, #14b8a6)"
            strokeWidth={STROKE}
            strokeDasharray={`${carbsLen} ${CIRCUMFERENCE - carbsLen}`}
            strokeDashoffset={carbsOffset}
            data-testid="macro-pie-carbs"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--macro-fat, #f59e0b)"
            strokeWidth={STROKE}
            strokeDasharray={`${fatLen} ${CIRCUMFERENCE - fatLen}`}
            strokeDashoffset={fatOffset}
            data-testid="macro-pie-fat"
          />
        </g>
      </svg>

      <ul className={styles.legend} aria-hidden="true">
        <li>
          <span className={styles.swatch} data-macro="protein" />
          {legend.protein} {(proteinPct * 100).toFixed(0)}%
        </li>
        <li>
          <span className={styles.swatch} data-macro="carbs" />
          {legend.carbs} {(carbsPct * 100).toFixed(0)}%
        </li>
        <li>
          <span className={styles.swatch} data-macro="fat" />
          {legend.fat} {(fatPct * 100).toFixed(0)}%
        </li>
      </ul>
    </div>
  );
}
