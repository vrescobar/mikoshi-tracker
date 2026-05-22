"use client";

import type { EntryEventDetail, EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import Link from "next/link";
import { useEffect, useState } from "react";

import { listFoodEvents } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { ProposalDialog } from "../ai/ProposalDialog";
import { useLocale } from "../locale";
import { Button, PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import { DayTotalsStrip } from "./DayTotalsStrip";
import { FoodEventCard } from "./FoodEventCard";
import styles from "./food-page.module.css";

type FoodPageProps = {
  initialEvents: EntryEventRecord[];
  dateKey: string;
  timeZone?: string;
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

export function FoodPage({ initialEvents, dateKey, timeZone }: FoodPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const [events, setEvents] = useState(initialEvents);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const clientToday = todayDateKey(timeZone);
    if (clientToday !== dateKey) {
      setLoading(true);
      void listFoodEvents(clientToday, clientToday).then((result) => {
        setEvents(result.items);
        setLoading(false);
      });
    }
  }, [dateKey, timeZone]);

  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  return (
    <div className={styles.stack} data-testid="food-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader
            eyebrow={copy.page.header.eyebrow}
            title={copy.page.header.title}
            description={copy.page.header.description}
          />

          <div className={styles.toolbar}>
            <Surface variant="soft" padding="md" className={styles.toolbarPanel}>
              <div className={styles.toolbarTop}>
                <div className={styles.toolbarIntro}>
                  <span className={styles.toolbarLabel}>{copy.page.toolbar.dateLabel}</span>
                </div>
                <div className={styles.toolbarActions}>
                  <Link href={routes.foodInsights} className={styles.insightsLink}>
                    Insights →
                  </Link>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => setDialogOpen(true)}
                  >
                    {copy.page.toolbar.addFood}
                  </Button>
                </div>
              </div>
            </Surface>
          </div>
        </PageFrame>
      </Surface>

      {events.length > 0 ? (
        <div className={styles.body}>
          <DayTotalsStrip events={events} />

          <div className={styles.list} aria-busy={loading}>
            {sorted.map((ev) => (
              <FoodEventCard key={ev.id} event={ev} />
            ))}
          </div>
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
