import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { FOOD_CHART, KCAL_PER_G } from "./food-chart-theme";
import styles from "./charts.module.css";

export type MacroDonutCopy = {
  empty: string;
  caption: string;
  legend: { protein: string; carbs: string; fat: string };
};

type MacroDonutProps = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  ariaLabel: string;
  copy: MacroDonutCopy;
};

/**
 * Macro distribution as a calm donut: protein / carbs / fat by their share of
 * total energy (kcal), with the total kcal called out in the hole. Recharts
 * port of the hand-rolled MacroPie, kept on the same macro tokens.
 */
export function MacroDonut({ proteinG, carbsG, fatG, ariaLabel, copy }: MacroDonutProps) {
  const proteinKcal = proteinG * KCAL_PER_G.protein;
  const carbsKcal = carbsG * KCAL_PER_G.carbs;
  const fatKcal = fatG * KCAL_PER_G.fat;
  const totalKcal = proteinKcal + carbsKcal + fatKcal;

  if (totalKcal <= 0) {
    return (
      <div className={styles.empty} data-testid="macro-donut-empty">
        {copy.empty}
      </div>
    );
  }

  const pct = (v: number) => Math.round((v / totalKcal) * 100);
  const slices = [
    { name: copy.legend.protein, value: proteinKcal, grams: Math.round(proteinG), color: FOOD_CHART.protein, pct: pct(proteinKcal) },
    { name: copy.legend.carbs, value: carbsKcal, grams: Math.round(carbsG), color: FOOD_CHART.carbs, pct: pct(carbsKcal) },
    { name: copy.legend.fat, value: fatKcal, grams: Math.round(fatG), color: FOOD_CHART.fat, pct: pct(fatKcal) },
  ];

  return (
    <div className={styles.donutWrap} data-testid="macro-donut" role="img" aria-label={ariaLabel}>
      <div className={styles.donutChart}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.donutCenter}>
          <span className={styles.donutValue}>{Math.round(totalKcal).toLocaleString()}</span>
          <span className={styles.donutUnit}>{copy.caption}</span>
        </div>
      </div>
      <dl className={styles.donutLegend}>
        {slices.map((s) => (
          <div key={s.name} className={styles.donutLegendRow}>
            <span className={styles.swatch} style={{ background: s.color }} />
            <dt>{s.name}</dt>
            <dd>
              <strong>{s.pct}%</strong>
              <span className={styles.donutGrams}>{s.grams} g</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
