"use client";

import Link from "next/link";

import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import styles from "./weight-today-panel.module.css";

type Props = {
  latestWeightKg: number | null;
  latestDate: string | null;
};

export function WeightTodayPanel({ latestWeightKg, latestDate }: Props) {
  const { copy } = useLocale();
  const c = copy.dashboard.weightToday;

  return (
    <section data-testid="dashboard-weight-today" className={styles.section}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h2 className={styles.title}>{c.title}</h2>
      </div>

      {latestWeightKg != null ? (
        <div className={styles.metric}>
          <strong className={styles.metricValue}>{latestWeightKg.toFixed(1)}</strong>
          <span className={styles.metricUnit}>{c.latestLabel}</span>
          {latestDate ? <span className={styles.metricDate}>{latestDate}</span> : null}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{c.emptyTitle}</p>
          <p className={styles.emptyDescription}>{c.emptyDescription}</p>
        </div>
      )}

      <Link href={routes.weight} className={styles.viewLink}>
        {c.viewWeight}
      </Link>
    </section>
  );
}
