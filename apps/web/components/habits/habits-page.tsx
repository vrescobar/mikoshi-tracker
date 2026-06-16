import { Link, useSearchParams } from "react-router";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

import { getHabitDetail, listHabits, restoreHabit, type HabitRecord } from "../../lib/auth-client";
import { listEntries, listEntryTypes, type EntryTypeRecord } from "../../lib/entries-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { routes } from "../../lib/navigation";
import { EntriesPage } from "../entries/entries-page";
import { PageBoundary } from "../../src/lib/page-boundary";
import { usePageData } from "../../src/lib/use-page-data";
import { useLocale } from "../locale";
import { Button, StatePanel, Surface, TabPanel, Tabs, type TabItem } from "../ui";
import { HabitsOverviewPage, type HabitOverviewRow } from "./habits-overview-page";
import { useState } from "react";
import styles from "./habits-page.module.css";

type TabId = "overview" | "activity" | "archived";
const TAB_IDS: TabId[] = ["overview", "activity", "archived"];
const HABIT_SLUGS = "habit_boolean,habit_quantity";

const COPY: Record<SupportedLocale, { title: string; description: string; tabs: Record<TabId, string>; archivedEmpty: { title: string; description: string }; restore: string; restoring: string }> = {
  en: {
    title: "Habits",
    description: "Every habit, your week at a glance, and the full activity log.",
    tabs: { overview: "Overview", activity: "All activity", archived: "Archived" },
    archivedEmpty: { title: "Nothing archived", description: "Habits you archive will rest here — you can restore them any time." },
    restore: "Restore",
    restoring: "Restoring…",
  },
  "zh-CN": {
    title: "习惯",
    description: "每个习惯、一周概览以及完整活动记录。",
    tabs: { overview: "概览", activity: "全部活动", archived: "已归档" },
    archivedEmpty: { title: "没有已归档项", description: "你归档的习惯会留在这里——可随时恢复。" },
    restore: "恢复",
    restoring: "恢复中…",
  },
  es: {
    title: "Hábitos",
    description: "Cada hábito, tu semana de un vistazo y el registro completo de actividad.",
    tabs: { overview: "Resumen", activity: "Toda la actividad", archived: "Archivados" },
    archivedEmpty: { title: "Nada archivado", description: "Los hábitos que archives descansarán aquí — puedes restaurarlos cuando quieras." },
    restore: "Restaurar",
    restoring: "Restaurando…",
  },
};

export function HabitsPage() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const active: TabId = TAB_IDS.includes(requested as TabId) ? (requested as TabId) : "overview";

  function selectTab(id: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  }

  const items: TabItem[] = [
    { id: "overview", label: copy.tabs.overview, icon: "habits" },
    { id: "activity", label: copy.tabs.activity, icon: "book" },
    { id: "archived", label: copy.tabs.archived, icon: "trophy" },
  ];

  return (
    <div className={styles.page} data-testid="habits-page">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.description}>{copy.description}</p>
        </div>
        <Tabs items={items} active={active} onChange={selectTab} ariaLabel={copy.title} variant="underline" />
      </header>

      {active === "overview" ? (
        <TabPanel id="overview">
          <OverviewTab />
        </TabPanel>
      ) : null}
      {active === "activity" ? (
        <TabPanel id="activity">
          <ActivityTab />
        </TabPanel>
      ) : null}
      {active === "archived" ? (
        <TabPanel id="archived">
          <ArchivedTab copy={copy} />
        </TabPanel>
      ) : null}
    </div>
  );
}

function OverviewTab() {
  const state = usePageData<{ rows: HabitOverviewRow[] }>(async () => {
    const habits = await listHabits({ status: "active" });
    const rows = await Promise.all(
      habits.map(async (habit) => ({ habit, detail: await getHabitDetail(habit.id).catch(() => null) })),
    );
    return { rows };
  }, []);

  return <PageBoundary state={state}>{(data) => <HabitsOverviewPage rows={data.rows} embedded />}</PageBoundary>;
}

function ActivityTab() {
  const state = usePageData<{ items: EntryRecord[]; entryTypes: EntryTypeRecord[] }>(async () => {
    const [items, entryTypes] = await Promise.all([
      listEntries({ entryTypeSlug: HABIT_SLUGS, isActive: true }),
      listEntryTypes().catch(() => []),
    ]);
    return { items, entryTypes };
  }, []);

  return (
    <PageBoundary state={state}>
      {(data) => <EntriesPage initialItems={data.items} entryTypeSlug={HABIT_SLUGS} entryTypes={data.entryTypes} />}
    </PageBoundary>
  );
}

function ArchivedTab({ copy }: { copy: (typeof COPY)[SupportedLocale] }) {
  const state = usePageData<{ habits: HabitRecord[] }>(async () => {
    const habits = await listHabits({ status: "archived" });
    return { habits };
  }, []);

  return (
    <PageBoundary state={state}>
      {(data) =>
        data.habits.length === 0 ? (
          <StatePanel tone="info" title={copy.archivedEmpty.title} description={copy.archivedEmpty.description} />
        ) : (
          <div className={styles.archivedList}>
            {data.habits.map((habit) => (
              <ArchivedRow key={habit.id} habit={habit} copy={copy} />
            ))}
          </div>
        )
      }
    </PageBoundary>
  );
}

function ArchivedRow({ habit, copy }: { habit: HabitRecord; copy: (typeof COPY)[SupportedLocale] }) {
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState(false);

  async function restore() {
    setPending(true);
    try {
      await restoreHabit(habit.id);
      setRestored(true);
    } catch {
      // Leave the row; the user can retry.
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface variant="panel" padding="md" className={styles.archivedRow} data-restored={restored ? "true" : "false"}>
      <Link to={routes.habitDetail(habit.id)} className={styles.archivedName}>
        {habit.name}
      </Link>
      <Button type="button" variant="secondary" size="sm" onClick={() => void restore()} disabled={pending || restored}>
        {pending ? copy.restoring : copy.restore}
      </Button>
    </Surface>
  );
}
