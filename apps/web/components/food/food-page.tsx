import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { FoodDayMeal, FoodDayResponse } from "@mikoshi-tracker/contracts/food";
import type { TodayMealSlot } from "@mikoshi-tracker/contracts/today";
import { useEffect, useState } from "react";

import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { sendChartToWhatsApp, getFoodDay } from "../../lib/diet-client";
import { getFoodAggregations } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { ProposalDialog } from "../ai/ProposalDialog";
import { useLocale } from "../locale";
import { Button, Icon, InlineStatus, StatePanel, Surface } from "../ui";
import { DietMealCard } from "./diet-meal-card";
import { DietProgressCard } from "./diet-progress-card";
import { KcalTrend } from "./KcalTrend";
import styles from "./food-page.module.css";

type FoodPageProps = {
  initialDay: FoodDayResponse;
  initialTrend: AggregationResponse | null;
  dateKey: string;
  timeZone?: string;
};

const CHART_COPY = {
  en: {
    send: "Send chart to WhatsApp",
    sending: "Sending…",
    sent: "Chart sent to WhatsApp.",
    failed: "Couldn't send the chart.",
  },
  "zh-CN": {
    send: "发送图表到 WhatsApp",
    sending: "发送中…",
    sent: "图表已发送到 WhatsApp。",
    failed: "无法发送图表。",
  },
  es: {
    send: "Enviar gráfica por WhatsApp",
    sending: "Enviando…",
    sent: "Gráfica enviada por WhatsApp.",
    failed: "No se pudo enviar la gráfica.",
  },
};

// Render order for meal-slot groups in the day view.
const SLOT_ORDER: TodayMealSlot[] = ["breakfast", "lunch", "snack", "dinner", "other"];

function groupBySlot(meals: FoodDayMeal[]): Array<{ slot: TodayMealSlot; meals: FoodDayMeal[] }> {
  const bySlot = new Map<TodayMealSlot, FoodDayMeal[]>();
  for (const meal of meals) {
    const slot = (meal.payload.mealSlot ?? "other") as TodayMealSlot;
    const list = bySlot.get(slot) ?? [];
    list.push(meal);
    bySlot.set(slot, list);
  }
  return SLOT_ORDER.filter((s) => bySlot.has(s)).map((slot) => ({ slot, meals: bySlot.get(slot)! }));
}

export function FoodPage({ initialDay, initialTrend, dateKey, timeZone }: FoodPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const t = copy.today;
  const chartCopy = CHART_COPY[locale];

  const [day, setDay] = useState(initialDay);
  const [trend, setTrend] = useState(initialTrend);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chartStatus, setChartStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const resolvedDateKey = todayKeyInTimeZone(timeZone);

  async function reload() {
    const from7 = shiftDays(resolvedDateKey, -6);
    const [nextDay, nextTrend] = await Promise.all([
      getFoodDay(resolvedDateKey).catch(() => null),
      getFoodAggregations(from7, resolvedDateKey, "day").catch(() => null),
    ]);
    if (nextDay) setDay(nextDay);
    if (nextTrend) setTrend(nextTrend);
  }

  // If the client's real "today" differs from what the loader resolved (timezone
  // skew near midnight), refetch the correct day.
  useEffect(() => {
    if (resolvedDateKey !== dateKey) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, resolvedDateKey]);

  async function sendChart() {
    setChartStatus("sending");
    try {
      const result = await sendChartToWhatsApp("kcal-trend", "7d");
      setChartStatus(result.delivered ? "sent" : "error");
    } catch {
      setChartStatus("error");
    }
  }

  const nutrition = day.nutrition;
  const target = nutrition?.kcalTarget ?? null;
  const groups = groupBySlot(day.meals);
  const hasMeals = day.meals.length > 0;

  return (
    <div className={styles.stack} data-testid="food-page">
      <div className={styles.toolbar}>
        <Button type="button" size="lg" onClick={() => setDialogOpen(true)}>
          <Icon name="plus" size="1.05rem" strokeWidth={2.4} />
          {copy.page.toolbar.addFood}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void sendChart()} disabled={chartStatus === "sending"}>
          {chartStatus === "sending" ? chartCopy.sending : chartCopy.send}
        </Button>
      </div>

      {chartStatus === "sent" ? <InlineStatus tone="success" title={chartCopy.sent} /> : null}
      {chartStatus === "error" ? <InlineStatus tone="danger" title={chartCopy.failed} /> : null}

      {/* 1 — Summary trend (last 7 days, with the goal line) */}
      <Surface variant="panel" padding="md" className={styles.trendCard}>
        <div className={styles.trendHead}>
          <span className={styles.trendTitle}>{t.trendTitle}</span>
          {target != null ? (
            <span className={styles.trendGoal}>
              {t.goalLineLabel} {target}
            </span>
          ) : null}
        </div>
        <KcalTrend
          buckets={trend?.buckets ?? []}
          label={t.trendTitle}
          emptyLabel={t.trendEmpty}
          target={target}
          targetLabel={target != null ? `${t.goalLineLabel} ${target}` : undefined}
        />
      </Surface>

      {/* 2 — Macros vs goals */}
      {nutrition ? <DietProgressCard nutrition={nutrition} mealCount={nutrition.mealCount} /> : null}

      {/* 3 — Today's meals, grouped by slot */}
      {hasMeals ? (
        <section className={styles.meals} aria-label={t.mealsTitle}>
          <h2 className={styles.mealsTitle}>{t.mealsTitle}</h2>
          {groups.map((group) => (
            <div key={group.slot} className={styles.slotGroup}>
              <h3 className={styles.slotHeading}>{copy.detail.mealSlots[group.slot]}</h3>
              <div className={styles.slotMeals}>
                {group.meals.map((meal) => (
                  <DietMealCard key={meal.eventId} meal={meal} onChanged={() => void reload()} />
                ))}
              </div>
            </div>
          ))}
          <p className={styles.hint}>{t.changeTimeHint}</p>
        </section>
      ) : (
        <StatePanel title={copy.page.emptyState.title} description={copy.page.emptyState.description} />
      )}

      <ProposalDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => void reload()} />
    </div>
  );
}
