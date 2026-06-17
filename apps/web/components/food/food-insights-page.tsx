import type { AggregationBucket, AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import { Link } from "react-router";
import { useState, useTransition } from "react";

import type { FoodPayload } from "../../lib/food-client";
import { getFoodAggregations, isFoodPayload, listFoodEvents } from "../../lib/food-client";
import { shiftDays } from "../../lib/dates";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Button, Field, InlineStatus, Input, PageFrame, PageHeader, Surface } from "../ui";
import { RangeHeatmap } from "./RangeHeatmap";
import { DailyIntakeChart } from "./charts/DailyIntakeChart";
import { MacroDonut } from "./charts/MacroDonut";
import { bucketsToIntakeData, type FoodChartGranularity } from "./charts/food-chart-theme";
import styles from "./food-insights-page.module.css";

type FoodInsightsPageProps = {
  initialAggregations: AggregationResponse | null;
  initialEvents: EntryEventRecord[];
  initialFrom: string;
  initialTo: string;
  /** Active daily kcal goal, used for the goal reference line. */
  goalKcalTarget?: number | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

type RepeatedMeal = {
  name: string;
  count: number;
  lastDate: string;
};

export function computeRepeatedMeals(events: EntryEventRecord[]): RepeatedMeal[] {
  const counts = new Map<string, { count: number; lastDate: string; display: string }>();
  for (const ev of events) {
    if (!isFoodPayload(ev.payload)) continue;
    const p = ev.payload;
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

export function getMissingDays(buckets: AggregationBucket[]): string[] {
  return buckets
    .filter((b) => b.missing && b.key.kind === "date")
    .map((b) => (b.key.kind === "date" ? b.key.value : ""))
    .filter((v) => v.length > 0);
}

function formatDate(dateKey: string, localeStr: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(
    localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

const PRESETS: { key: "last7" | "last30" | "last90"; days: number }[] = [
  { key: "last7", days: 7 },
  { key: "last30", days: 30 },
  { key: "last90", days: 90 },
];

const GRANULARITIES: FoodChartGranularity[] = ["day", "week", "month"];

export function FoodInsightsPage({
  initialAggregations,
  initialEvents,
  initialFrom,
  initialTo,
  goalKcalTarget = null,
}: FoodInsightsPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale).insights;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [granularity, setGranularity] = useState<FoodChartGranularity>("day");
  const [aggregations, setAggregations] = useState(initialAggregations);
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(newFrom: string, newTo: string, newGranularity: FoodChartGranularity) {
    if (!newFrom || !newTo || newFrom > newTo) return;
    setError(null);
    startTransition(async () => {
      try {
        const [aggs, evs] = await Promise.all([
          getFoodAggregations(newFrom, newTo, newGranularity),
          listFoodEvents(newFrom, newTo).then((r) => r.items),
        ]);
        setFrom(newFrom);
        setTo(newTo);
        setDraftFrom(newFrom);
        setDraftTo(newTo);
        setGranularity(newGranularity);
        setAggregations(aggs);
        setEvents(evs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load data");
      }
    });
  }

  function handleApply() {
    load(draftFrom, draftTo, granularity);
  }

  function applyPreset(days: number) {
    load(shiftDays(to, -(days - 1)), to, granularity);
  }

  function applyGranularity(next: FoodChartGranularity) {
    if (next === granularity) return;
    load(from, to, next);
  }

  const repeatedMeals = computeRepeatedMeals(events);
  const missingDays = aggregations ? getMissingDays(aggregations.buckets) : [];

  const intakeData = aggregations ? bucketsToIntakeData(aggregations.buckets, granularity, locale) : [];
  const loggedBuckets = intakeData.filter((d) => !d.missing && d.kcal > 0).length;

  const totalKcal = aggregations?.total.sum.kcal ?? 0;
  const totalCount = aggregations?.total.count ?? 0;
  const avgPerBucket = loggedBuckets > 0 ? totalKcal / loggedBuckets : 0;
  // Goal line only makes sense per-day; weekly/monthly buckets sum many days.
  const chartTarget = granularity === "day" ? goalKcalTarget : null;

  return (
    <div className={styles.stack} data-testid="food-insights-page">
      <Surface variant="hero">
        <PageFrame>
          <div className={styles.backRow}>
            <Link to={routes.food} className={styles.backLink}>
              ← {getFoodCopy(locale).detail.backToFood.replace("← ", "")}
            </Link>
          </div>
          <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} description={copy.header.description} />

          <Surface variant="soft" padding="md" className={styles.rangePanel}>
            <div className={styles.controlsRow}>
              <div className={styles.controlGroup} role="group" aria-label={copy.controls.rangeLabel}>
                <span className={styles.controlLabel}>{copy.controls.rangeLabel}</span>
                <div className={styles.segmented} data-testid="food-range-presets">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={styles.segment}
                      onClick={() => applyPreset(p.days)}
                      disabled={isPending}
                    >
                      {copy.controls[p.key]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.controlGroup} role="group" aria-label={copy.controls.granularityLabel}>
                <span className={styles.controlLabel}>{copy.controls.granularityLabel}</span>
                <div className={styles.segmented} data-testid="food-granularity">
                  {GRANULARITIES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`${styles.segment} ${granularity === g ? styles.segmentActive : ""}`}
                      aria-pressed={granularity === g}
                      onClick={() => applyGranularity(g)}
                      disabled={isPending}
                    >
                      {copy.controls[g]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
                <Button
                  type="button"
                  onClick={handleApply}
                  disabled={isPending || !draftFrom || !draftTo || draftFrom > draftTo}
                >
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
                <span className={styles.summaryValue}>{Math.round(avgPerBucket).toLocaleString()}</span>
                <span className={styles.summaryLabel}>{copy.summary.avgUnit[granularity]}</span>
              </div>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{loggedBuckets}</span>
                <span className={styles.summaryLabel}>{copy.summary.loggedUnit[granularity]}</span>
              </div>
              <div className={styles.summaryFact}>
                <span className={styles.summaryValue}>{totalCount}</span>
                <span className={styles.summaryLabel}>{copy.summary.meals}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Daily intake — stacked macro-kcal bars + goal/average lines */}
        {aggregations ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{copy.dailyIntake.title}</h2>
            <p className={styles.muted}>{copy.dailyIntake.description}</p>
            <DailyIntakeChart
              data={intakeData}
              target={chartTarget}
              average={avgPerBucket > 0 ? avgPerBucket : null}
              ariaLabel={copy.dailyIntake.title}
              copy={{
                empty: copy.dailyIntake.empty,
                kcalLabel: copy.dailyIntake.kcalLabel,
                legend: copy.dailyIntake.legend,
                targetLabel: copy.dailyIntake.targetLabel,
                averageLabel: copy.dailyIntake.averageLabel,
              }}
            />
          </div>
        ) : null}

        {/* Macro distribution */}
        {aggregations ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{copy.macroPie.title}</h2>
            <p className={styles.muted}>{copy.macroPie.description}</p>
            <MacroDonut
              proteinG={aggregations.total.sum.protein_g ?? 0}
              carbsG={aggregations.total.sum.carbs_g ?? 0}
              fatG={aggregations.total.sum.fat_g ?? 0}
              ariaLabel={copy.macroPie.title}
              copy={{
                empty: copy.macroPie.empty,
                caption: copy.macroPie.caption,
                legend: copy.macroPie.legend,
              }}
            />
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
