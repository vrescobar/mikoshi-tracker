import type { HabitTrendPoint } from "@mikoshi-tracker/contracts/habits";

import { useLocale } from "../locale";
import styles from "./HabitWeekStrip.module.css";

type HabitWeekStripProps = {
  /** The habit's last 7 days, oldest → newest (the contract guarantees length 7). */
  points: HabitTrendPoint[];
  statusLabels: Record<HabitTrendPoint["status"], string>;
  ariaLabel: string;
};

function weekdayLetter(dateKey: string, localeStr: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const locale = localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US";
  // Single narrow weekday letter (M/T/W… or 一/二… or L/M…).
  return date.toLocaleDateString(locale, { weekday: "narrow" });
}

function fullDayLabel(dateKey: string, localeStr: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const locale = localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US";
  return date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

/**
 * A 7-cell weekly compliance strip for one habit. Each cell's appearance is
 * driven entirely by a `data-status` attribute (zero-JS theming, mirroring the
 * RangeHeatmap pattern), and carries an accessible per-day label so the grid is
 * legible to screen readers, not just sighted users.
 */
export function HabitWeekStrip({ points, statusLabels, ariaLabel }: HabitWeekStripProps) {
  const { locale } = useLocale();

  return (
    <div className={styles.strip} role="list" aria-label={ariaLabel} data-testid="habit-week-strip">
      {points.map((point) => {
        const label = `${fullDayLabel(point.date, locale)}: ${statusLabels[point.status]}`;
        return (
          <div key={point.date} role="listitem" className={styles.day}>
            <span className={styles.letter} aria-hidden="true">
              {weekdayLetter(point.date, locale)}
            </span>
            <span className={styles.cell} data-status={point.status} title={label} aria-label={label} />
          </div>
        );
      })}
    </div>
  );
}
