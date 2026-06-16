import type { HabitDetail, HabitDetailHistoryRow } from "@mikoshi-tracker/contracts/habits";
import { useState } from "react";
import { Link } from "react-router";

import { archiveHabit, restoreHabit } from "../../lib/auth-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Button, Icon, InlineStatus, Surface } from "../ui";
import { HabitMonthHeatmap } from "./HabitMonthHeatmap";
import styles from "./habit-detail-page.module.css";

type StatusLabels = Record<"completed" | "pending" | "missed" | "not_due", string>;

type Copy = {
  back: string;
  statsTitle: string;
  currentStreak: string;
  longestStreak: string;
  totalCompletions: string;
  interruptions: string;
  heatmapTitle: string;
  heatmapHint: string;
  historyTitle: string;
  historyHint: string;
  historyEmpty: string;
  settingsTitle: string;
  frequency: string;
  target: string;
  startDate: string;
  category: string;
  archive: string;
  restore: string;
  archived: string;
  archivedNotice: string;
  pending: string;
  freq: { daily: string; weekdays: string; weeklyCount: (n: number) => string; monthlyCount: (n: number) => string };
  status: StatusLabels;
  rowStatus: { completed: string; missed: string };
  none: string;
};

const COPY: Record<SupportedLocale, Copy> = {
  en: {
    back: "← All habits",
    statsTitle: "At a glance",
    currentStreak: "Current streak",
    longestStreak: "Longest streak",
    totalCompletions: "Total check-ins",
    interruptions: "Interruptions",
    heatmapTitle: "Last 30 days",
    heatmapHint: "Each square is a day — solid means done, dashed is today, faded red is a miss.",
    historyTitle: "History",
    historyHint: "Period-by-period record straight from the tracker's audit log.",
    historyEmpty: "No history recorded yet.",
    settingsTitle: "Settings",
    frequency: "Frequency",
    target: "Target",
    startDate: "Started",
    category: "Category",
    archive: "Archive habit",
    restore: "Restore habit",
    archived: "Archived",
    archivedNotice: "This habit is archived. Restore it to keep tracking.",
    pending: "Working…",
    freq: {
      daily: "Daily",
      weekdays: "Weekdays",
      weeklyCount: (n) => `${n}× per week`,
      monthlyCount: (n) => `${n}× per month`,
    },
    status: { completed: "completed", pending: "pending today", missed: "missed", not_due: "not due" },
    rowStatus: { completed: "Completed", missed: "Missed" },
    none: "—",
  },
  "zh-CN": {
    back: "← 所有习惯",
    statsTitle: "概览",
    currentStreak: "当前连续",
    longestStreak: "最长连续",
    totalCompletions: "总打卡",
    interruptions: "中断次数",
    heatmapTitle: "最近 30 天",
    heatmapHint: "每个方块是一天——实色为完成，虚线为今天，淡红为错过。",
    historyTitle: "历史",
    historyHint: "直接来自追踪器审计日志的逐周期记录。",
    historyEmpty: "尚无历史记录。",
    settingsTitle: "设置",
    frequency: "频率",
    target: "目标",
    startDate: "开始于",
    category: "分类",
    archive: "归档习惯",
    restore: "恢复习惯",
    archived: "已归档",
    archivedNotice: "此习惯已归档。恢复以继续追踪。",
    pending: "处理中…",
    freq: {
      daily: "每天",
      weekdays: "工作日",
      weeklyCount: (n) => `每周 ${n} 次`,
      monthlyCount: (n) => `每月 ${n} 次`,
    },
    status: { completed: "已完成", pending: "今天待办", missed: "错过", not_due: "无需进行" },
    rowStatus: { completed: "已完成", missed: "错过" },
    none: "—",
  },
  es: {
    back: "← Todos los hábitos",
    statsTitle: "De un vistazo",
    currentStreak: "Racha actual",
    longestStreak: "Racha más larga",
    totalCompletions: "Registros totales",
    interruptions: "Interrupciones",
    heatmapTitle: "Últimos 30 días",
    heatmapHint: "Cada casilla es un día — sólido es hecho, discontinuo es hoy, rojo tenue es un fallo.",
    historyTitle: "Historial",
    historyHint: "Registro periodo a periodo directo del log de auditoría del tracker.",
    historyEmpty: "Aún no hay historial registrado.",
    settingsTitle: "Ajustes",
    frequency: "Frecuencia",
    target: "Objetivo",
    startDate: "Inicio",
    category: "Categoría",
    archive: "Archivar hábito",
    restore: "Restaurar hábito",
    archived: "Archivado",
    archivedNotice: "Este hábito está archivado. Restáuralo para seguir registrando.",
    pending: "Procesando…",
    freq: {
      daily: "A diario",
      weekdays: "Días laborables",
      weeklyCount: (n) => `${n}× por semana`,
      monthlyCount: (n) => `${n}× por mes`,
    },
    status: { completed: "completado", pending: "pendiente hoy", missed: "perdido", not_due: "no toca" },
    rowStatus: { completed: "Completado", missed: "Perdido" },
    none: "—",
  },
};

function frequencyLabel(detail: HabitDetail, copy: Copy): string {
  const { habit } = detail;
  switch (habit.frequencyType) {
    case "weekdays":
      return copy.freq.weekdays;
    case "weekly_count":
      return copy.freq.weeklyCount(habit.frequencyCount ?? 1);
    case "monthly_count":
      return copy.freq.monthlyCount(habit.frequencyCount ?? 1);
    default:
      return copy.freq.daily;
  }
}

export function HabitDetailPage({ detail: initialDetail }: { detail: HabitDetail }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [habit, setHabit] = useState(initialDetail.habit);
  const [pending, setPending] = useState(false);
  const detail = { ...initialDetail, habit };

  async function toggleArchive() {
    setPending(true);
    try {
      const updated = habit.isActive ? await archiveHabit(habit.id) : await restoreHabit(habit.id);
      setHabit((prev) => ({ ...prev, isActive: updated.isActive }));
    } catch {
      // Leave state unchanged; the user can retry.
    } finally {
      setPending(false);
    }
  }

  const history = [...detail.recentHistory].reverse();

  return (
    <div className={styles.page} data-testid="habit-detail-page">
      <Link to={routes.habits} className={styles.back}>
        {copy.back}
      </Link>

      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <h1 className={styles.title}>{habit.name}</h1>
          <div className={styles.tags}>
            <span className={styles.tag}>{frequencyLabel(detail, copy)}</span>
            {habit.category ? <span className={styles.tag}>{habit.category}</span> : null}
            {!habit.isActive ? <span className={styles.tagArchived}>{copy.archived}</span> : null}
          </div>
          {habit.description ? <p className={styles.description}>{habit.description}</p> : null}
        </div>
        <Button
          type="button"
          variant={habit.isActive ? "secondary" : "primary"}
          onClick={() => void toggleArchive()}
          disabled={pending}
        >
          {pending ? copy.pending : habit.isActive ? copy.archive : copy.restore}
        </Button>
      </header>

      {!habit.isActive ? <InlineStatus tone="warning" title={copy.archivedNotice} /> : null}

      <section className={styles.statsCard}>
        <span className={styles.cardLabel}>{copy.statsTitle}</span>
        <div className={styles.statsGrid}>
          <Stat
            icon="flame"
            color="var(--cat-streak)"
            soft="var(--cat-streak-soft)"
            value={detail.stats.currentStreak}
            label={copy.currentStreak}
          />
          <Stat
            icon="trophy"
            color="var(--cat-mind)"
            soft="var(--cat-mind-soft)"
            value={detail.stats.longestStreak}
            label={copy.longestStreak}
          />
          <Stat
            icon="check"
            color="var(--cat-water)"
            soft="var(--cat-water-soft)"
            value={detail.stats.totalCompletions}
            label={copy.totalCompletions}
          />
          <Stat
            icon="trend"
            color="var(--cat-rest)"
            soft="var(--cat-rest-soft)"
            value={detail.stats.interruptionCount}
            label={copy.interruptions}
          />
        </div>
      </section>

      <Surface variant="panel" padding="md" className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>{copy.heatmapTitle}</h2>
          <p className={styles.blockHint}>{copy.heatmapHint}</p>
        </div>
        <HabitMonthHeatmap
          points={detail.trends.last30Days}
          statusLabels={copy.status}
          ariaLabel={`${habit.name}: ${copy.heatmapTitle}`}
        />
      </Surface>

      <div className={styles.twoCol}>
        <Surface variant="panel" padding="md" className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>{copy.historyTitle}</h2>
            <p className={styles.blockHint}>{copy.historyHint}</p>
          </div>
          {history.length === 0 ? (
            <p className={styles.empty}>{copy.historyEmpty}</p>
          ) : (
            <ul className={styles.history}>
              {history.map((row) => (
                <HistoryRow key={`${row.periodType}-${row.periodKey}`} row={row} copy={copy} locale={locale} />
              ))}
            </ul>
          )}
        </Surface>

        <Surface variant="panel" padding="md" className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>{copy.settingsTitle}</h2>
          </div>
          <dl className={styles.settings}>
            <SettingRow label={copy.frequency} value={frequencyLabel(detail, copy)} />
            <SettingRow
              label={copy.target}
              value={habit.targetValue ? `${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""}` : copy.none}
            />
            <SettingRow label={copy.startDate} value={habit.startDate} />
            <SettingRow label={copy.category} value={habit.category ?? copy.none} />
          </dl>
        </Surface>
      </div>
    </div>
  );
}

function Stat({
  icon,
  color,
  soft,
  value,
  label,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
  soft: string;
  value: number;
  label: string;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statIcon} style={{ color, background: soft }}>
        <Icon name={icon} />
      </span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function HistoryRow({ row, copy, locale }: { row: HabitDetailHistoryRow; copy: Copy; locale: SupportedLocale }) {
  const date = new Date(`${row.periodStart}T12:00:00`);
  const loc = locale === "zh-CN" ? "zh-CN" : locale === "es" ? "es" : "en-US";
  const periodLabel =
    row.periodType === "day"
      ? date.toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric" })
      : `${date.toLocaleDateString(loc, { month: "short", day: "numeric" })} →`;
  return (
    <li className={styles.historyRow} data-status={row.status}>
      <span className={styles.historyDot} aria-hidden="true" />
      <span className={styles.historyPeriod}>{periodLabel}</span>
      <span className={styles.historyMeta}>
        {row.completionCount}/{row.completionTarget}
      </span>
      <span className={styles.historyStatus}>{copy.rowStatus[row.status]}</span>
    </li>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.settingRow}>
      <dt className={styles.settingLabel}>{label}</dt>
      <dd className={styles.settingValue}>{value}</dd>
    </div>
  );
}
