"use client";

import Link from "next/link";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";

import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import styles from "./food-today-panel.module.css";

export function FoodTodayPanel({
  aggregations,
  onQuickAdd,
}: {
  aggregations: AggregationResponse | null;
  onQuickAdd?: () => void;
}) {
  const { copy } = useLocale();
  const c = copy.dashboard.foodToday;

  const total = aggregations?.total;
  const isEmpty = !total || total.count === 0;

  return (
    <section data-testid="dashboard-food-today" className={styles.section}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{c.title}</h2>
          {onQuickAdd ? (
            <button
              type="button"
              className={styles.quickAddButton}
              onClick={onQuickAdd}
              aria-label={c.quickAdd}
              data-testid="food-today-quick-add"
            >
              +
            </button>
          ) : null}
        </div>
        <p className={styles.description}>{c.description}</p>
      </div>

      {isEmpty ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{c.emptyState.title}</p>
          <p className={styles.emptyDescription}>{c.emptyState.description}</p>
        </div>
      ) : (
        <div className={styles.metrics}>
          <div className={styles.metricCard} data-highlight="true">
            <span className={styles.metricLabel}>{c.metrics.kcal}</span>
            <strong className={styles.metricValue}>{Math.round(total.sum.kcal ?? 0)}</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>{c.metrics.protein}</span>
            <strong className={styles.metricValue}>{(total.sum.protein_g ?? 0).toFixed(1)}g</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>{c.metrics.carbs}</span>
            <strong className={styles.metricValue}>{(total.sum.carbs_g ?? 0).toFixed(1)}g</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>{c.metrics.fat}</span>
            <strong className={styles.metricValue}>{(total.sum.fat_g ?? 0).toFixed(1)}g</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>{c.metrics.meals}</span>
            <strong className={styles.metricValue}>{total.count}</strong>
          </div>
        </div>
      )}

      <Link href={routes.food} className={styles.viewLink}>
        {c.viewFood}
      </Link>
    </section>
  );
}
