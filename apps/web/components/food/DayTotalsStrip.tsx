import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

import type { FoodPayload } from "../../lib/food-client";
import { isFoodPayload } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { useLocale } from "../locale";
import styles from "./DayTotalsStrip.module.css";

type DayTotalsStripProps = {
  events: EntryEventRecord[];
};

type Totals = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  count: number;
};

function computeTotals(events: EntryEventRecord[]): Totals {
  const totals: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, count: 0 };
  for (const ev of events) {
    if (!isFoodPayload(ev.payload)) continue;
    const p = ev.payload;
    totals.kcal += p.kcal;
    totals.protein_g += p.protein_g;
    totals.carbs_g += p.carbs_g;
    totals.fat_g += p.fat_g;
    if (p.fiber_g !== null) totals.fiber_g += p.fiber_g;
    totals.count += 1;
  }
  return totals;
}

export function DayTotalsStrip({ events }: DayTotalsStripProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale).page.totals;
  const totals = computeTotals(events);

  return (
    <div className={styles.strip} data-testid="day-totals-strip">
      <span className={styles.label}>{copy.label}</span>
      <div className={styles.facts}>
        <div className={styles.fact} data-highlight="true">
          <span className={styles.factValue}>{Math.round(totals.kcal)}</span>
          <span className={styles.factLabel}>{copy.kcal}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factValue}>{totals.protein_g.toFixed(1)}g</span>
          <span className={styles.factLabel}>{copy.protein}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factValue}>{totals.carbs_g.toFixed(1)}g</span>
          <span className={styles.factLabel}>{copy.carbs}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factValue}>{totals.fat_g.toFixed(1)}g</span>
          <span className={styles.factLabel}>{copy.fat}</span>
        </div>
        {totals.fiber_g > 0 ? (
          <div className={styles.fact}>
            <span className={styles.factValue}>{totals.fiber_g.toFixed(1)}g</span>
            <span className={styles.factLabel}>{copy.fiber}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
