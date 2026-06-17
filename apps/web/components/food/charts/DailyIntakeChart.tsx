import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FOOD_CHART, foodTooltipStyle, type IntakeDatum } from "./food-chart-theme";
import styles from "./charts.module.css";

export type DailyIntakeCopy = {
  empty: string;
  kcalLabel: string;
  legend: { protein: string; carbs: string; fat: string };
  targetLabel: string;
  averageLabel: string;
};

type DailyIntakeChartProps = {
  data: IntakeDatum[];
  /** Per-bucket kcal goal line (omit to hide). */
  target?: number | null;
  /** Per-bucket average kcal line (omit to hide). */
  average?: number | null;
  ariaLabel: string;
  copy: DailyIntakeCopy;
};

type TooltipPayload = { payload?: IntakeDatum }[];

function IntakeTooltip({
  active,
  payload,
  copy,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  copy: DailyIntakeCopy;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div style={foodTooltipStyle} className={styles.tooltip}>
      <div className={styles.tooltipHead}>{datum.fullLabel}</div>
      <div className={styles.tooltipKcal}>
        {datum.kcal.toLocaleString()} {copy.kcalLabel}
      </div>
      <dl className={styles.tooltipRows}>
        <div className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: FOOD_CHART.protein }} />
          <dt>{copy.legend.protein}</dt>
          <dd>{datum.proteinG} g</dd>
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: FOOD_CHART.carbs }} />
          <dt>{copy.legend.carbs}</dt>
          <dd>{datum.carbsG} g</dd>
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: FOOD_CHART.fat }} />
          <dt>{copy.legend.fat}</dt>
          <dd>{datum.fatG} g</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Daily intake as stacked macro-kcal bars (protein/carbs/fat converted to their
 * energy contribution, so a bar's height reads as the day's intake) with an
 * optional dashed goal line and a dashed average line. This is the "consumo
 * diario en barras con desglose de macros" hero of the Explore tab.
 */
export function DailyIntakeChart({ data, target, average, ariaLabel, copy }: DailyIntakeChartProps) {
  const hasData = data.some((d) => !d.missing && d.kcal > 0);
  if (!hasData) {
    return (
      <div className={styles.empty} data-testid="daily-intake-chart-empty">
        {copy.empty}
      </div>
    );
  }

  return (
    <div className={styles.chartWrap} data-testid="daily-intake-chart" role="img" aria-label={ariaLabel}>
      <div className={styles.legend}>
        <LegendChip color={FOOD_CHART.protein} label={copy.legend.protein} />
        <LegendChip color={FOOD_CHART.carbs} label={copy.legend.carbs} />
        <LegendChip color={FOOD_CHART.fat} label={copy.legend.fat} />
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid stroke={FOOD_CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: FOOD_CHART.axis }}
            tickLine={false}
            axisLine={{ stroke: FOOD_CHART.grid }}
            interval="preserveStartEnd"
            minTickGap={14}
          />
          <YAxis
            tick={{ fontSize: 11, fill: FOOD_CHART.axis }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            cursor={{ fill: "rgba(239, 111, 83, 0.06)" }}
            content={<IntakeTooltip copy={copy} />}
          />
          <Bar dataKey="proteinKcal" stackId="macro" fill={FOOD_CHART.protein} maxBarSize={46} />
          <Bar dataKey="carbsKcal" stackId="macro" fill={FOOD_CHART.carbs} maxBarSize={46} />
          <Bar dataKey="fatKcal" stackId="macro" fill={FOOD_CHART.fat} radius={[5, 5, 0, 0]} maxBarSize={46} />
          {average ? (
            <ReferenceLine y={Math.round(average)} stroke={FOOD_CHART.average} strokeDasharray="2 4" strokeWidth={1.5}>
              <Label
                value={`${copy.averageLabel} ${Math.round(average).toLocaleString()}`}
                position="insideTopRight"
                fill={FOOD_CHART.average}
                fontSize={10}
                fontWeight={600}
              />
            </ReferenceLine>
          ) : null}
          {target ? (
            <ReferenceLine y={Math.round(target)} stroke={FOOD_CHART.target} strokeDasharray="5 5" strokeWidth={1.5}>
              <Label
                value={`${copy.targetLabel} ${Math.round(target).toLocaleString()}`}
                position="insideTopLeft"
                fill={FOOD_CHART.target}
                fontSize={10}
                fontWeight={700}
              />
            </ReferenceLine>
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendChip}>
      <span className={styles.swatch} style={{ background: color }} />
      {label}
    </span>
  );
}
