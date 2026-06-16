import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import { useEffect, useState } from "react";

import { getTodaySummary } from "../../lib/auth-client";
import { isFoodPayload } from "../../lib/food-client";
import { ProgressRing } from "../dashboard/ProgressRing";
import { useLocale } from "../locale";
import { Surface } from "../ui";
import styles from "./food-summary-card.module.css";

type FoodSummaryCardProps = {
  events: EntryEventRecord[];
};

const COPY = {
  en: { title: "Today's summary", meals: "meals", left: "kcal left", over: "kcal over", of: "of" },
  "zh-CN": { title: "今日总结", meals: "餐", left: "千卡剩余", over: "千卡超出", of: "/" },
  es: { title: "Resumen de hoy", meals: "comidas", left: "kcal restantes", over: "kcal de más", of: "de" },
};

const MACROS = [
  { key: "kcal", label: "kcal", color: "var(--color-accent-diet)", soft: "var(--color-accent-diet-soft)", unit: "" },
  { key: "protein_g", label: "Protein", color: "var(--cat-rest)", soft: "var(--cat-rest-soft)", unit: "g" },
  { key: "carbs_g", label: "Carbs", color: "var(--cat-move)", soft: "var(--cat-move-soft)", unit: "g" },
  { key: "fat_g", label: "Fat", color: "var(--cat-water)", soft: "var(--cat-water-soft)", unit: "g" },
  { key: "fiber_g", label: "Fiber", color: "var(--cat-mind)", soft: "var(--cat-mind-soft)", unit: "g" },
] as const;

const MACRO_LABELS: Record<"en" | "zh-CN" | "es", Record<string, string>> = {
  en: { kcal: "kcal", protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat", fiber_g: "Fiber" },
  "zh-CN": { kcal: "千卡", protein_g: "蛋白质", carbs_g: "碳水", fat_g: "脂肪", fiber_g: "纤维" },
  es: { kcal: "kcal", protein_g: "Proteína", carbs_g: "Carbos", fat_g: "Grasa", fiber_g: "Fibra" },
};

export function FoodSummaryCard({ events }: FoodSummaryCardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [target, setTarget] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTodaySummary()
      .then((res) => {
        if (!cancelled) setTarget(res.nutrition?.kcalTarget ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = events.reduce(
    (acc, ev) => {
      if (isFoodPayload(ev.payload)) {
        acc.kcal += ev.payload.kcal;
        acc.protein_g += ev.payload.protein_g;
        acc.carbs_g += ev.payload.carbs_g;
        acc.fat_g += ev.payload.fat_g;
        acc.fiber_g += ev.payload.fiber_g ?? 0;
      }
      return acc;
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );

  const ringValue = target ? Math.min(totals.kcal / target, 1) : totals.kcal > 0 ? 1 : 0;
  const ringLabel = target ? `${Math.round((totals.kcal / target) * 100)}%` : String(Math.round(totals.kcal));
  const ringSub = target ? `${Math.round(totals.kcal)} ${copy.of} ${target}` : "kcal";
  const remaining = target ? Math.round(target - totals.kcal) : null;

  return (
    <div className={styles.wrap}>
      <Surface variant="panel" padding="md" className={styles.summary}>
        <div className={styles.summaryHead}>
          <span className={styles.cardLabel}>{copy.title}</span>
          <span className={styles.mealCount}>
            {events.length} {copy.meals}
          </span>
        </div>
        <div className={styles.ringRow}>
          <ProgressRing value={ringValue} label={ringLabel} sublabel={ringSub} color="var(--color-accent-diet)" />
          {remaining !== null ? (
            <p className={styles.remaining}>
              <span className={styles.remainingValue}>{Math.abs(remaining)}</span>
              {remaining >= 0 ? copy.left : copy.over}
            </p>
          ) : null}
        </div>
      </Surface>

      <div className={styles.macros}>
        {MACROS.map((m) => (
          <div key={m.key} className={styles.macroTile}>
            <span className={styles.macroDot} style={{ background: m.color }} aria-hidden="true" />
            <span className={styles.macroValue}>
              {Math.round(totals[m.key])}
              {m.unit}
            </span>
            <span className={styles.macroLabel}>{MACRO_LABELS[locale][m.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
