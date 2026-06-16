import type { OverviewStats, OverviewTrendPoint } from "@mikoshi-tracker/contracts/stats";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

import { useLocale } from "../locale";
import { Icon, Surface } from "../ui";
import { ProgressRing } from "./ProgressRing";
import styles from "./today-board.module.css";

type TodayBoardProps = {
  summary: TodaySummary;
  overview: OverviewStats;
  userName: string;
};

type BoardCopy = {
  greeting: (name: string) => string;
  progressTitle: string;
  habitsDone: (done: number, total: number) => string;
  streakTitle: string;
  streakDays: (n: number) => string;
  bestStreak: (n: number) => string;
  statsTitle: string;
  weeklyAvg: string;
  weeklyDone: string;
  best: string;
  weekdayFmt: string;
};

const COPY: Record<"en" | "zh-CN" | "es", BoardCopy> = {
  en: {
    greeting: (n) => `${timeGreetingEn()}${n ? `, ${n}` : ""}!`,
    progressTitle: "Today's progress",
    habitsDone: (d, t) => `${d}/${t} habits`,
    streakTitle: "Current streak",
    streakDays: (n) => `${n} ${n === 1 ? "day" : "days"}`,
    bestStreak: (n) => `Best streak ${n} days`,
    statsTitle: "Statistics",
    weeklyAvg: "Weekly average",
    weeklyDone: "Habits completed",
    best: "Best streak",
    weekdayFmt: "en-US",
  },
  "zh-CN": {
    greeting: (n) => `${timeGreetingZh()}${n ? `，${n}` : ""}！`,
    progressTitle: "今日进度",
    habitsDone: (d, t) => `${d}/${t} 习惯`,
    streakTitle: "当前连续",
    streakDays: (n) => `${n} 天`,
    bestStreak: (n) => `最佳 ${n} 天`,
    statsTitle: "统计",
    weeklyAvg: "周平均",
    weeklyDone: "已完成习惯",
    best: "最佳连续",
    weekdayFmt: "zh-CN",
  },
  es: {
    greeting: (n) => `${timeGreetingEs()}${n ? `, ${n}` : ""}!`,
    progressTitle: "Progreso de hoy",
    habitsDone: (d, t) => `${d}/${t} hábitos`,
    streakTitle: "Racha actual",
    streakDays: (n) => `${n} ${n === 1 ? "día" : "días"}`,
    bestStreak: (n) => `Mejor racha ${n} días`,
    statsTitle: "Estadísticas",
    weeklyAvg: "Promedio semanal",
    weeklyDone: "Hábitos completados",
    best: "Mejor racha",
    weekdayFmt: "es",
  },
};

function timeGreetingEn() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 19 ? "Good afternoon" : "Good evening";
}
function timeGreetingEs() {
  const h = new Date().getHours();
  return h < 12 ? "¡Buenos días" : h < 20 ? "¡Buenas tardes" : "¡Buenas noches";
}
function timeGreetingZh() {
  const h = new Date().getHours();
  return h < 12 ? "早上好" : h < 19 ? "下午好" : "晚上好";
}

function isComplete(point: OverviewTrendPoint): boolean {
  return point.totalCount > 0 && point.completedCount >= point.totalCount;
}

function computeStreaks(points: OverviewTrendPoint[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const p of points) {
    if (isComplete(p)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  // Current streak = trailing run from the most recent day backward.
  let current = 0;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (isComplete(points[i])) current += 1;
    else break;
  }
  return { current, best };
}

function weekdayLetter(dateKey: string, locale: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale, { weekday: "narrow" });
}

export function TodayBoard({ summary, overview, userName }: TodayBoardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const pct = Math.round(summary.completionRate * 100);
  const { current, best } = computeStreaks(overview.trends.last30Days);
  const week = overview.trends.last7Days;
  const weeklyDone = week.reduce((sum, p) => sum + p.completedCount, 0);
  const weeklyAvgPct = Math.round(overview.metrics.weeklyCompletionRate * 100);

  const today = new Date().toLocaleDateString(copy.weekdayFmt, { weekday: "long", day: "numeric", month: "long" });
  const firstName = userName.trim().split(/\s+/)[0] ?? "";

  return (
    <div className={styles.board}>
      <header className={styles.greeting}>
        <div>
          <h1 className={styles.hello}>{copy.greeting(firstName)}</h1>
          <p className={styles.date}>{capitalize(today)}</p>
        </div>
        <span className={styles.bell} aria-hidden="true">
          <Icon name="bell" />
        </span>
      </header>

      <div className={styles.topGrid}>
        <Surface variant="panel" padding="md" className={styles.progressCard}>
          <span className={styles.cardLabel}>{copy.progressTitle}</span>
          <div className={styles.progressBody}>
            <ProgressRing value={summary.completionRate} label={`${pct}%`} />
            <p className={styles.habitsDone}>{copy.habitsDone(summary.completedCount, summary.totalCount)}</p>
          </div>
        </Surface>

        <Surface variant="panel" padding="md" className={styles.streakCard}>
          <div className={styles.streakHead}>
            <span className={styles.cardLabel}>{copy.streakTitle}</span>
            <span className={styles.streakValue}>
              <span className={styles.flame} aria-hidden="true">
                <Icon name="flame" />
              </span>
              {copy.streakDays(current)}
            </span>
          </div>
          <div className={styles.weekStrip} role="list">
            {week.map((p) => (
              <div key={p.date} role="listitem" className={styles.weekDay}>
                <span className={styles.weekLetter} aria-hidden="true">
                  {weekdayLetter(p.date, copy.weekdayFmt)}
                </span>
                <span className={styles.weekCircle} data-complete={isComplete(p) ? "true" : "false"}>
                  {isComplete(p) ? <Icon name="check" size="0.85rem" strokeWidth={2.6} /> : null}
                </span>
              </div>
            ))}
          </div>
          <p className={styles.bestStreak}>{copy.bestStreak(best)}</p>
        </Surface>
      </div>

      <Surface variant="panel" padding="md" className={styles.statsCard}>
        <span className={styles.cardLabel}>{copy.statsTitle}</span>
        <div className={styles.statsGrid}>
          <StatTile icon="trend" color="var(--cat-rest)" soft="var(--cat-rest-soft)" value={`${weeklyAvgPct}%`} label={copy.weeklyAvg} />
          <StatTile icon="check" color="var(--cat-water)" soft="var(--cat-water-soft)" value={String(weeklyDone)} label={copy.weeklyDone} />
          <StatTile icon="trophy" color="var(--cat-mind)" soft="var(--cat-mind-soft)" value={String(best)} label={copy.best} />
        </div>
      </Surface>
    </div>
  );
}

function StatTile({
  icon,
  color,
  soft,
  value,
  label,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
  soft: string;
  value: string;
  label: string;
}) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statIcon} style={{ color, background: soft }}>
        <Icon name={icon} />
      </span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
