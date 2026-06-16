import type { HabitTrendPoint } from "@mikoshi-tracker/contracts/habits";

import { useLocale } from "../locale";
import styles from "./HabitMonthHeatmap.module.css";

type Props = {
  /** The habit's last 30 days, oldest → newest (contract guarantees length 30). */
  points: HabitTrendPoint[];
  statusLabels: Record<HabitTrendPoint["status"], string>;
  ariaLabel: string;
};

function dayLabel(dateKey: string, localeStr: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const locale = localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US";
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/**
 * A 30-day compliance heatmap for one habit. Like HabitWeekStrip, each cell is
 * themed purely by its `data-status` attribute and carries an accessible label,
 * so the grid reads correctly for assistive tech as well as sighted users.
 */
export function HabitMonthHeatmap({ points, statusLabels, ariaLabel }: Props) {
  const { locale } = useLocale();

  return (
    <div className={styles.grid} role="list" aria-label={ariaLabel} data-testid="habit-month-heatmap">
      {points.map((point) => {
        const label = `${dayLabel(point.date, locale)}: ${statusLabels[point.status]}`;
        return (
          <span
            key={point.date}
            role="listitem"
            className={styles.cell}
            data-status={point.status}
            title={label}
            aria-label={label}
          />
        );
      })}
    </div>
  );
}
