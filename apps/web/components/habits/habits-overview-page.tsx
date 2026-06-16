import type { HabitDetail } from "@mikoshi-tracker/contracts/habits";
import { Link } from "react-router";

import type { HabitRecord } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Icon, PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import { HabitWeekStrip } from "./HabitWeekStrip";
import { StreakBadge } from "./StreakBadge";
import { countPeriodCompletions, describeStreak, type StreakCopy } from "./streak";
import styles from "./habits-overview-page.module.css";

export type HabitOverviewRow = { habit: HabitRecord; detail: HabitDetail | null };

type HabitsOverviewPageProps = {
  rows: HabitOverviewRow[];
  /** When rendered inside the Habits tabs, the shell owns the page header. */
  embedded?: boolean;
};

type StatusLabels = Record<"completed" | "pending" | "missed" | "not_due", string>;

type OverviewCopy = {
  eyebrow: string;
  title: string;
  description: string;
  onTrack: (onTrack: number, total: number) => string;
  empty: { title: string; description: string; askHint: string };
  frequency: {
    daily: string;
    weekdays: string;
    weeklyCount: (n: number) => string;
    monthlyCount: (n: number) => string;
  };
  status: StatusLabels;
  streak: StreakCopy;
};

const COPY: Record<"en" | "zh-CN" | "es", OverviewCopy> = {
  en: {
    eyebrow: "Your system",
    title: "Habits",
    description: "Every habit and how this past week went — at a glance.",
    onTrack: (n, total) => `${n} of ${total} on track this week`,
    empty: {
      title: "No habits yet",
      description: "Create one here, or just tell Mikoshi on WhatsApp “track meditation daily.”",
      askHint: "Tip: the chat assistant can set these up for you.",
    },
    frequency: {
      daily: "Daily",
      weekdays: "Weekdays",
      weeklyCount: (n) => `${n}×/week`,
      monthlyCount: (n) => `${n}×/month`,
    },
    status: { completed: "completed", pending: "pending today", missed: "missed", not_due: "not due" },
    streak: {
      dayStreak: (n) => `${n}-day streak`,
      weekdayStreak: (n) => `${n} weekdays in a row`,
      periodStreak: (n, unit) => `${n}-${unit} streak`,
      keepAlive: (r, unit) => (r <= 0 ? "" : `${r} more this ${unit} keeps your streak`),
      periodProgress: (done, target, unit) => `${done}/${target} this ${unit}`,
    },
  },
  "zh-CN": {
    eyebrow: "你的系统",
    title: "习惯",
    description: "一眼看清每个习惯以及过去一周的表现。",
    onTrack: (n, total) => `本周 ${total} 个中有 ${n} 个达标`,
    empty: {
      title: "还没有习惯",
      description: "在这里创建一个，或在 WhatsApp 上对 Mikoshi 说“每天打卡冥想”。",
      askHint: "提示：聊天助手可以帮你建立这些习惯。",
    },
    frequency: {
      daily: "每天",
      weekdays: "工作日",
      weeklyCount: (n) => `每周 ${n} 次`,
      monthlyCount: (n) => `每月 ${n} 次`,
    },
    status: { completed: "已完成", pending: "今天待办", missed: "错过", not_due: "无需进行" },
    streak: {
      dayStreak: (n) => `连续 ${n} 天`,
      weekdayStreak: (n) => `连续 ${n} 个工作日`,
      periodStreak: (n, unit) => `连续 ${n} ${unit === "week" ? "周" : "月"}`,
      keepAlive: (r, unit) => (r <= 0 ? "" : `本${unit === "week" ? "周" : "月"}再 ${r} 次即可保持连续`),
      periodProgress: (done, target, unit) => `本${unit === "week" ? "周" : "月"} ${done}/${target}`,
    },
  },
  es: {
    eyebrow: "Tu sistema",
    title: "Hábitos",
    description: "Cada hábito y cómo fue tu última semana — de un vistazo.",
    onTrack: (n, total) => `${n} de ${total} al día esta semana`,
    empty: {
      title: "Aún no hay hábitos",
      description: "Crea uno aquí, o dile a Mikoshi por WhatsApp “registra meditar a diario”.",
      askHint: "Sugerencia: el asistente de chat puede configurarlos por ti.",
    },
    frequency: {
      daily: "A diario",
      weekdays: "Días laborables",
      weeklyCount: (n) => `${n}×/semana`,
      monthlyCount: (n) => `${n}×/mes`,
    },
    status: { completed: "completado", pending: "pendiente hoy", missed: "perdido", not_due: "no toca" },
    streak: {
      dayStreak: (n) => `racha de ${n} días`,
      weekdayStreak: (n) => `${n} días laborables seguidos`,
      periodStreak: (n, unit) => `racha de ${n} ${unit === "week" ? "semanas" : "meses"}`,
      keepAlive: (r, unit) =>
        r <= 0 ? "" : `${r} más esta${unit === "week" ? " semana" : ""}${unit === "month" ? " mes" : ""} mantiene tu racha`,
      periodProgress: (done, target, unit) => `${done}/${target} esta ${unit === "week" ? "semana" : "mes"}`,
    },
  },
};

function frequencyLabel(habit: HabitRecord, copy: OverviewCopy): string {
  switch (habit.frequencyType) {
    case "weekdays":
      return copy.frequency.weekdays;
    case "weekly_count":
      return copy.frequency.weeklyCount(habit.frequencyCount ?? 1);
    case "monthly_count":
      return copy.frequency.monthlyCount(habit.frequencyCount ?? 1);
    default:
      return copy.frequency.daily;
  }
}

function isOnTrack(row: HabitOverviewRow): boolean {
  if (!row.detail) return false;
  const { habit, detail } = row;
  if (habit.frequencyType === "weekly_count" || habit.frequencyType === "monthly_count") {
    return countPeriodCompletions(detail.trends.last7Days, habit.frequencyType) >= (habit.frequencyCount ?? 1);
  }
  // For daily/weekday habits: no missed day in the last 7.
  return !detail.trends.last7Days.some((p) => p.status === "missed");
}

export function HabitsOverviewPage({ rows, embedded = false }: HabitsOverviewPageProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const onTrackCount = rows.filter(isOnTrack).length;

  return (
    <PageFrame>
      {embedded ? null : (
        <PageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={rows.length > 0 ? copy.onTrack(onTrackCount, rows.length) : copy.description}
        />
      )}

      {rows.length === 0 ? (
        <StatePanel
          tone="info"
          eyebrow={copy.eyebrow}
          title={copy.empty.title}
          description={copy.empty.description}
          testId="habits-overview-empty"
        />
      ) : (
        <div className={styles.list} data-testid="habits-overview-list">
          {rows.map(({ habit, detail }) => {
            const points = detail?.trends.last7Days ?? [];
            const periodCompleted = detail
              ? countPeriodCompletions(points, habit.frequencyType)
              : 0;
            const descriptor = detail
              ? describeStreak(habit, detail.stats, periodCompleted, copy.streak)
              : null;

            return (
              <Surface key={habit.id} variant="panel" padding="md" className={styles.row} data-testid="habit-row">
                <div className={styles.meta}>
                  <Link to={routes.habitDetail(habit.id)} className={styles.name}>
                    {habit.name}
                    <Icon name="trend" size="0.9rem" />
                  </Link>
                  <span className={styles.frequency}>{frequencyLabel(habit, copy)}</span>
                </div>

                {descriptor ? <StreakBadge descriptor={descriptor} /> : null}

                {points.length > 0 ? (
                  <HabitWeekStrip points={points} statusLabels={copy.status} ariaLabel={`${habit.name}: ${copy.title}`} />
                ) : null}
              </Surface>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
