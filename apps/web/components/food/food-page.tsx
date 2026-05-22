"use client";

import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import Link from "next/link";
import { useEffect, useState } from "react";

import { listFoodEvents } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Button, PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import { DayTotalsStrip } from "./DayTotalsStrip";
import { FoodEventCard } from "./FoodEventCard";
import styles from "./food-page.module.css";

type FoodPageProps = {
  initialEvents: EntryEventRecord[];
  dateKey: string;
};

function todayDateKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export function FoodPage({ initialEvents, dateKey }: FoodPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const [events, setEvents] = useState(initialEvents);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clientToday = todayDateKey();
    if (clientToday !== dateKey) {
      setLoading(true);
      void listFoodEvents(clientToday, clientToday).then((result) => {
        setEvents(result.items);
        setLoading(false);
      });
    }
  }, [dateKey]);

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
                  <Button type="button" size="lg" disabled title={copy.page.toolbar.addFoodComingSoon}>
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
    </div>
  );
}
