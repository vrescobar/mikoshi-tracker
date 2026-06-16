import type { TodayItem, TodaySummary } from "@mikoshi-tracker/contracts/today";
import { useState } from "react";
import { Link } from "react-router";

import { completeTodayHabit, setTodayHabitTotal, undoTodayHabit } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Icon, Surface } from "../ui";
import { categorizeHabit } from "./category";
import styles from "./habits-today-card.module.css";

type HabitsTodayCardProps = {
  initialSummary: TodaySummary;
  onChanged?: () => void;
};

const COPY = {
  en: { title: "Today's habits", edit: "Edit", empty: "Nothing scheduled for today.", done: "all done!" },
  "zh-CN": { title: "今日习惯", edit: "编辑", empty: "今天没有安排。", done: "全部完成！" },
  es: { title: "Hábitos de hoy", edit: "Editar", empty: "Nada para hoy.", done: "¡todo hecho!" },
};

export function HabitsTodayCard({ initialSummary, onChanged }: HabitsTodayCardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState<string | null>(null);

  const items = [...summary.pendingItems, ...summary.completedItems];

  async function toggle(item: TodayItem) {
    if (busy) return;
    setBusy(item.habitId);
    try {
      const done = item.status === "completed";
      const res = done
        ? await undoTodayHabit({ habitId: item.habitId, source: "web" })
        : item.kind === "quantity"
          ? await setTodayHabitTotal({ habitId: item.habitId, total: item.progress.targetValue ?? 1, source: "web" })
          : await completeTodayHabit({ habitId: item.habitId, source: "web" });
      setSummary(res.summary);
      onChanged?.();
    } catch {
      // Best-effort; a failed toggle simply leaves the row unchanged.
    } finally {
      setBusy(null);
    }
  }

  return (
    <Surface variant="panel" padding="md" className={styles.card}>
      <header className={styles.head}>
        <h2 className={styles.title}>{copy.title}</h2>
        <Link to={routes.habits} className={styles.edit}>
          {copy.edit}
        </Link>
      </header>

      {items.length === 0 ? (
        <p className={styles.empty}>{copy.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item, i) => {
            const cat = categorizeHabit(item.name, i);
            const done = item.status === "completed";
            return (
              <li key={item.habitId} className={styles.row} data-done={done ? "true" : "false"}>
                <span className={styles.chip} style={{ color: cat.color, background: cat.soft }} aria-hidden="true">
                  <Icon name={cat.icon} />
                </span>
                <span className={styles.name}>{item.name}</span>
                <button
                  type="button"
                  className={styles.toggle}
                  data-done={done ? "true" : "false"}
                  aria-pressed={done}
                  aria-label={item.name}
                  disabled={busy === item.habitId}
                  onClick={() => void toggle(item)}
                >
                  {done ? <Icon name="check" size="1rem" strokeWidth={2.8} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
