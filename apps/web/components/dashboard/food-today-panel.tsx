"use client";

import { Link } from "react-router";
import { useState, useTransition } from "react";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";

import { updateEntry } from "../../lib/entries-client";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import styles from "./food-today-panel.module.css";

export function FoodTodayPanel({
  aggregations,
  onQuickAdd,
  foodEntryId = null,
  dailyKcalTarget = null,
  onTargetSaved,
}: {
  aggregations: AggregationResponse | null;
  onQuickAdd?: () => void;
  foodEntryId?: string | null;
  dailyKcalTarget?: number | null;
  onTargetSaved?: (next: number | null) => void;
}) {
  const { copy } = useLocale();
  const c = copy.dashboard.foodToday;
  const targetCopy = c.target;

  const total = aggregations?.total;
  const isEmpty = !total || total.count === 0;

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState(
    dailyKcalTarget != null ? String(dailyKcalTarget) : "",
  );
  const [targetError, setTargetError] = useState<string | null>(null);
  const [, startTargetTransition] = useTransition();

  function handleSaveTarget() {
    if (!foodEntryId) return;
    const trimmed = targetDraft.trim();
    const next = trimmed === "" ? null : Number.parseFloat(trimmed);
    if (next !== null && (Number.isNaN(next) || next <= 0)) {
      setTargetError(targetCopy.errorTitle);
      return;
    }
    startTargetTransition(async () => {
      setTargetError(null);
      try {
        await updateEntry(foodEntryId, {
          config: { dailyKcalTarget: next },
        });
        setIsEditingTarget(false);
        onTargetSaved?.(next);
      } catch (err) {
        setTargetError(err instanceof Error ? err.message : targetCopy.errorTitle);
      }
    });
  }

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
              aria-label={c.quickAddLabel}
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

      {foodEntryId ? (
        <div className={styles.targetRow} data-testid="food-today-target">
          {isEditingTarget ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveTarget();
              }}
              className={styles.targetForm}
            >
              <input
                type="number"
                min={0}
                step="any"
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                placeholder={targetCopy.placeholder}
                className={styles.targetInput}
                aria-label={targetCopy.placeholder}
              />
              <button type="submit" className={styles.targetSave}>
                {targetCopy.save}
              </button>
              <button
                type="button"
                className={styles.targetCancel}
                onClick={() => {
                  setIsEditingTarget(false);
                  setTargetDraft(dailyKcalTarget != null ? String(dailyKcalTarget) : "");
                  setTargetError(null);
                }}
              >
                {targetCopy.cancel}
              </button>
              {targetError ? <span className={styles.targetError}>{targetError}</span> : null}
            </form>
          ) : (
            <>
              <span className={styles.targetLabel}>
                {dailyKcalTarget != null
                  ? targetCopy.currentLabel(dailyKcalTarget)
                  : targetCopy.emptyLabel}
              </span>
              <button
                type="button"
                className={styles.targetEdit}
                onClick={() => setIsEditingTarget(true)}
                data-testid="food-today-target-edit"
              >
                {targetCopy.editLabel}
              </button>
            </>
          )}
        </div>
      ) : null}

      <Link to={routes.food} className={styles.viewLink}>
        {c.viewFood}
      </Link>
    </section>
  );
}
