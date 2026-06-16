import { Link } from "react-router";

import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Icon, Surface } from "../ui";
import { ProgressRing } from "./ProgressRing";
import styles from "./diet-today-card.module.css";

type DietTodayCardProps = {
  kcalToday: number;
  mealCount: number;
  kcalTarget: number | null;
};

const COPY = {
  en: { title: "Diet today", meals: (n: number) => `${n} ${n === 1 ? "meal" : "meals"}`, of: "of", kcal: "kcal", left: "kcal left", over: "kcal over", open: "Open diet" },
  "zh-CN": { title: "今日饮食", meals: (n: number) => `${n} 餐`, of: "/", kcal: "千卡", left: "千卡剩余", over: "千卡超出", open: "打开饮食" },
  es: { title: "Comida de hoy", meals: (n: number) => `${n} ${n === 1 ? "comida" : "comidas"}`, of: "de", kcal: "kcal", left: "kcal restantes", over: "kcal de más", open: "Abrir comida" },
};

/**
 * A compact diet summary for the Today board: a small calorie ring (green while
 * within the daily goal, coral when over) plus today's meal count, linking into
 * the full Diet page. Rendered only when there's a goal or at least one meal.
 */
export function DietTodayCard({ kcalToday, mealCount, kcalTarget }: DietTodayCardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const value = kcalTarget ? Math.min(kcalToday / kcalTarget, 1) : kcalToday > 0 ? 1 : 0;
  const label = kcalTarget ? `${Math.round((kcalToday / kcalTarget) * 100)}%` : String(Math.round(kcalToday));
  const sub = kcalTarget ? `${Math.round(kcalToday)} ${copy.of} ${kcalTarget}` : copy.kcal;
  const onTrack = kcalTarget != null && kcalToday <= kcalTarget;
  const color = onTrack ? "var(--color-accent)" : "var(--color-accent-diet)";
  const remaining = kcalTarget ? Math.round(kcalTarget - kcalToday) : null;

  return (
    <Surface variant="panel" padding="md" className={styles.card}>
      <div className={styles.head}>
        <span className={styles.label}>{copy.title}</span>
        <Link to={routes.food} className={styles.open}>
          {copy.open}
          <Icon name="diet" size="0.9rem" />
        </Link>
      </div>
      <div className={styles.body}>
        <ProgressRing value={value} label={label} sublabel={sub} color={color} size={104} stroke={10} />
        <div className={styles.meta}>
          <span className={styles.meals}>{copy.meals(mealCount)}</span>
          {remaining !== null ? (
            <span className={styles.remaining}>
              <strong>{Math.abs(remaining)}</strong> {remaining >= 0 ? copy.left : copy.over}
            </span>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
