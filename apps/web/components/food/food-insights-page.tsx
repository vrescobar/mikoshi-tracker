"use client";

import type { AggregationBucket, AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import Link from "next/link";
import { useState, useTransition } from "react";

import type { FoodPayload } from "../../lib/food-client";
import { getFoodAggregations, isFoodPayload, listFoodEvents } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Button, Field, InlineStatus, Input, PageFrame, PageHeader, Surface } from "../ui";
import { RangeHeatmap } from "./RangeHeatmap";
import styles from "./food-insights-page.module.css";

type FoodInsightsPageProps = {
  initialAggregations: AggregationResponse | null;
  initialEvents: EntryEventRecord[];
  initialFrom: string;
  initialTo: string;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

type RepeatedMeal = {
  name: string;
  count: number;
  lastDate: string;
};

function computeRepeatedMeals(events: EntryEventRecord[]): RepeatedMeal[] {
  const counts = new Map<string, { count: number; lastDate: string; display: string }>();
  for (const ev of events) {
    if (!isFoodPayload(ev.payload)) continue;
    const p = ev.payload as FoodPayload;
    const key = normalizeName(p.name);
    const existing = counts.get(key);
    const date = ev.dateKey;
    if (existing) {
      existing.count += 1;
      if (date > existing.lastDate) existing.lastDate = date;
    } else {
      counts.set(key, { count: 1, lastDate: date, display: p.name });
    }
  }
  return Array.from(counts.values())
    .filter((v) => v.count > 1)
    .sort((a, b) => b.count - a.count)
    .map((v) => ({ name: v.display, count: v.count, lastDate: v.lastDate }));
}

function getMissingDays(buckets: AggregationBucket[]): string[] {
  return buckets.filter((b) => b.missing).map((b) => b.key);
}

function formatDate(dateKey: string, localeStr: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(
    localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export function FoodInsightsPage({ initialAggregations, initialEvents, initialFrom, initialTo }: FoodInsightsPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale).insights;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [aggregations, setAggregations] = useState(initialAggregations);
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    const newFrom = draftFrom;
    const newTo = draftTo;
    setError(null);

    startTransition(async () => {
      try {
        const [aggs, evs] = await Promise.all([
          getFoodAggregations(newFrom, newTo),
          listFoodEvents(newFrom, newTo).then((r) => r.items),
        ]);
        setFrom(newFrom);
        setTo(newTo);
        setAggregations(aggs);
        setEvents(evs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load data");
      }
    });
  }

  const repeatedMeals = computeRepeatedMeals(events);
  const missingDays = aggregations ? getMissingDays(aggregations.buckets) : [];

  const totalKcal = aggregations?.total.sum["kcal"] ?? 0;
  const totalCount = aggregations?.total.count ?? 0;
  const daysLogged = aggregations ? aggregations.buckets.filter((b) => !b.missing && b.count > 0).length : 0;
  const avgKcal = daysLogged > 0 ? totalKcal / daysLogged : 0;

  return (
    <div className={styles.stack} data-testid="food-insights-page">
      <Surface variant="hero">
        <PageFrame>
          <div className={styles.backRow}>
            <Link href={routes.food} className={styles.backLink}>
              ← {getFoodCopy(locale).detail.backToFood.replace("← ", "")}
            </Link>
          </div>
          <PageHeader
            eyebrow={copy.header.eyebrow}
            title={copy.header.title}
            description={copy.header.description}
          />

          <Surface variant="soft" padding="md" className={styles.rangePanel}>
            <div className={styles.rangeRow}>
              <Field label={copy.rangePicker.fromLabel} htmlFor="insights-from">
                <Input
                  id="insights-from"
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <Field label={copy.rangePicker.toLabel} htmlFor="insights-to">
                <Input
                  id="insights-to"
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <div className={styles.applyCol}>
                <Button type="button" onClick={handleApply} disabled={isPending || !draftFrom || !draftTo || draftFrom > draftTo}>
                  {copy.rangePicker.applyLabel}
                </Button>
              </div>
            </div>
          </Surface>

          {error ? (
            <InlineStatus tone="danger" title="Error">
              {error}
            </InlineStatus>
          ) : null}
        </PageFrame>
      </Surface>

      <div className={styles.sections}>
        {/* Summary */}
        {aggregations ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{copy.summary.title}</h2>
            <div className={styles.summaryFacts}>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{Math.round(totalKcal).toLocaleString()}</span>
                <span className={styles.summaryLabel}>{copy.summary.totalKcal}</span>
              </div>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{Math.round(avgKcal)}</span>
                <span className={styles.summaryLabel}>{copy.summary.avgKcal}</span>
              </div>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{daysLogged}</span>
                <span className={styles.summaryLabel}>{copy.summary.totalDays}</span>
              </div>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{totalCount}</span>
                <span className={styles.summaryLabel}>{copy.summary.meals}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Heatmap */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.heatmap.title}</h2>
          {aggregations ? (
            <RangeHeatmap buckets={aggregations.buckets} from={from} to={to} />
          ) : (
            <p className={styles.muted}>{copy.heatmap.noData}</p>
          )}
        </div>

        {/* Repeated meals */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.repeatedMeals.title}</h2>
          <p className={styles.muted}>{copy.repeatedMeals.description}</p>
          {repeatedMeals.length === 0 ? (
            <p className={styles.emptyState}>{copy.repeatedMeals.emptyState}</p>
          ) : (
            <div className={styles.repeatedList}>
              {repeatedMeals.map((meal) => (
                <div key={meal.name} className={styles.repeatedRow}>
                  <span className={styles.repeatedName}>{meal.name}</span>
                  <span className={styles.repeatedCount}>{copy.repeatedMeals.timesLabel(meal.count)}</span>
                  <span className={styles.repeatedDate}>{formatDate(meal.lastDate, locale)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing days */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.missingDays.title}</h2>
          <p className={styles.muted}>{copy.missingDays.description}</p>
          {missingDays.length === 0 ? (
            <p className={styles.emptyState}>{copy.missingDays.emptyState}</p>
          ) : (
            <ul className={styles.missingList}>
              {missingDays.map((day) => (
                <li key={day} className={styles.missingDay}>
                  {formatDate(day, locale)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
