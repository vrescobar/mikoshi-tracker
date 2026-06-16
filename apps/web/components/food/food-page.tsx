import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventDetail, EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import { useEffect, useState } from "react";

import { sendChartToWhatsApp } from "../../lib/diet-client";
import { listFoodEvents } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { ProposalDialog } from "../ai/ProposalDialog";
import { useLocale } from "../locale";
import { Button, Icon, InlineStatus, StatePanel } from "../ui";
import { FoodSearchBox } from "./food-search-box";
import { FoodSummaryCard } from "./food-summary-card";
import { FoodEventCard } from "./FoodEventCard";
import { RepeatsPanel } from "./RepeatsPanel";
import styles from "./food-page.module.css";

type FoodPageProps = {
  initialEvents: EntryEventRecord[];
  dateKey: string;
  timeZone?: string;
  initialRepeats?: AggregationResponse | null;
};

const CHART_COPY = {
  en: { send: "Send chart to WhatsApp", sending: "Sending…", sent: "Chart sent to WhatsApp.", failed: "Couldn't send the chart." },
  "zh-CN": { send: "发送图表到 WhatsApp", sending: "发送中…", sent: "图表已发送到 WhatsApp。", failed: "无法发送图表。" },
  es: { send: "Enviar gráfica por WhatsApp", sending: "Enviando…", sent: "Gráfica enviada por WhatsApp.", failed: "No se pudo enviar la gráfica." },
};

// Resolve "today" in the user's timezone (matching how the API buckets dateKey).
// A naive UTC date would disagree with the server's dateKey near midnight and trigger
// a spurious refetch for the wrong day, hiding events that exist for the real today.
function todayDateKey(timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone && timeZone.length > 0 ? timeZone : undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function FoodPage({ initialEvents, dateKey, timeZone, initialRepeats = null }: FoodPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const chartCopy = CHART_COPY[locale];
  const [events, setEvents] = useState(initialEvents);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chartStatus, setChartStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const resolvedDateKey = todayDateKey(timeZone);

  useEffect(() => {
    if (resolvedDateKey !== dateKey) {
      setLoading(true);
      void listFoodEvents(resolvedDateKey, resolvedDateKey).then((result) => {
        setEvents(result.items);
        setLoading(false);
      });
    }
  }, [dateKey, resolvedDateKey]);

  async function refetchToday() {
    const result = await listFoodEvents(resolvedDateKey, resolvedDateKey).catch(() => null);
    if (result) setEvents(result.items);
  }

  async function sendChart() {
    setChartStatus("sending");
    try {
      const result = await sendChartToWhatsApp("macro-donut", "7d");
      setChartStatus(result.delivered ? "sent" : "error");
    } catch {
      setChartStatus("error");
    }
  }

  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

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

      {events.length > 0 ? <FoodSummaryCard events={events} /> : null}

      <FoodSearchBox onLogged={() => void refetchToday()} />

      <RepeatsPanel
        aggregations={initialRepeats}
        copy={{
          title: copy.page.repeats.title,
          description: copy.page.repeats.description,
          empty: copy.page.repeats.empty,
          logAgain: copy.page.repeats.logAgain,
          logging: copy.page.repeats.logging,
          errorTitle: copy.page.repeats.errorTitle,
          countLabel: (count) => `${count}×`,
        }}
        onLogged={(event) => {
          setEvents((prev) => [...prev, event]);
        }}
      />

      {events.length > 0 ? (
        <div className={styles.list} aria-busy={loading}>
          {sorted.map((ev) => (
            <FoodEventCard key={ev.id} event={ev} />
          ))}
        </div>
      ) : (
        <StatePanel title={copy.page.emptyState.title} description={copy.page.emptyState.description} />
      )}

      <ProposalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(event: EntryEventDetail) => {
          setEvents((prev) => [...prev, event]);
        }}
      />
    </div>
  );
}
