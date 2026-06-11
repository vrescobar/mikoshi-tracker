import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

import { useLocale } from "../locale";
import styles from "./today-unified-strip.module.css";

type Props = {
  summary: TodaySummary | null;
  foodAggregations: AggregationResponse | null;
  /** Resolved daily kcal target from the user's food_meal Entry config. */
  dailyKcalTarget: number | null;
};

/**
 * Phase 13 G-DASH-3: tiny "what's left for me today" strip that combines
 * still-open habits + food kcal progress into one glance. Hidden when both
 * sides are empty. Sits above TodayDashboard / DashboardFoodSection so the
 * user sees the headline before drilling in.
 */
export function TodayUnifiedStrip({ summary, foodAggregations, dailyKcalTarget }: Props) {
  const { copy } = useLocale();
  const c = copy.dashboard.todayUnified;
  const pending = summary?.pendingCount ?? 0;
  const completed = summary?.completedCount ?? 0;
  const kcalToday = Math.round(foodAggregations?.total.sum.kcal ?? 0);

  const resolvedTarget =
    typeof dailyKcalTarget === "number" && dailyKcalTarget > 0 ? dailyKcalTarget : null;
  const hasKcalTarget = resolvedTarget !== null;
  const kcalPct = resolvedTarget !== null
    ? Math.min(100, Math.round((kcalToday / resolvedTarget) * 100))
    : 0;

  const isEmpty = pending === 0 && completed === 0 && kcalToday === 0 && !hasKcalTarget;
  if (isEmpty) return null;

  return (
    <section className={styles.strip} data-testid="today-unified-strip">
      <div className={styles.row} data-row="habits">
        <span className={styles.label}>{c.habitsLabel}</span>
        <strong className={styles.value}>
          {pending === 0 ? c.habitsAllDone : c.habitsPending(pending)}
        </strong>
      </div>
      <div className={styles.row} data-row="kcal">
        <span className={styles.label}>{c.kcalLabel}</span>
        <strong className={styles.value}>
          {resolvedTarget !== null
            ? c.kcalProgress(kcalToday, resolvedTarget)
            : c.kcalNoTarget(kcalToday)}
        </strong>
        {resolvedTarget !== null ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-valuenow={kcalToday}
            aria-valuemin={0}
            aria-valuemax={resolvedTarget}
            data-testid="today-unified-strip-progress"
          >
            <div className={styles.progressFill} style={{ width: `${kcalPct}%` }} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
