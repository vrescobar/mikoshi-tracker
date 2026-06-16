import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router";

import type { SupportedLocale } from "../../lib/i18n/messages";
import { useLocale } from "../locale";
import { SkeletonBlock, TabPanel, Tabs, type TabItem } from "../ui";
import { DietGoalPanel } from "./diet-goal-panel";
import { FoodPage } from "./food-page";
import styles from "./diet-page.module.css";

// Trends/Body reuse the existing route pages (each owns its own data loading);
// lazy so their charts/recharts bundles only load when those tabs open.
const FoodInsightsRoute = lazy(() => import("../../src/pages/food-insights-route"));
const WeightPageRoute = lazy(() => import("../../src/pages/weight-page-route"));

type DietPageProps = {
  initialEvents: EntryEventRecord[];
  dateKey: string;
  timeZone?: string;
  initialRepeats?: AggregationResponse | null;
};

type TabId = "today" | "trends" | "body" | "goal";

const TAB_IDS: TabId[] = ["today", "trends", "body", "goal"];

const COPY: Record<SupportedLocale, { title: string; description: string; tabs: Record<TabId, string> }> = {
  en: {
    title: "Diet",
    description: "Today's meals, trends, body weight, and your daily goal.",
    tabs: { today: "Today", trends: "Trends", body: "Body", goal: "Goal" },
  },
  "zh-CN": {
    title: "饮食",
    description: "今日餐食、趋势、体重和每日目标。",
    tabs: { today: "今日", trends: "趋势", body: "身体", goal: "目标" },
  },
  es: {
    title: "Comida",
    description: "Comidas de hoy, tendencias, peso corporal y tu objetivo diario.",
    tabs: { today: "Hoy", trends: "Tendencias", body: "Cuerpo", goal: "Objetivo" },
  },
};

export function DietPage(props: DietPageProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const active: TabId = TAB_IDS.includes(requested as TabId) ? (requested as TabId) : "today";

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
    { id: "today", label: copy.tabs.today, icon: "diet" },
    { id: "trends", label: copy.tabs.trends, icon: "trend" },
    { id: "body", label: copy.tabs.body, icon: "trophy" },
    { id: "goal", label: copy.tabs.goal, icon: "sparkles" },
  ];

  return (
    <div className={styles.page} data-testid="diet-page">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.description}>{copy.description}</p>
        </div>
        <Tabs items={items} active={active} onChange={selectTab} ariaLabel={copy.title} variant="underline" />
      </header>

      <Suspense fallback={<SkeletonBlock height="12rem" />}>
        {active === "today" ? (
          <TabPanel id="today">
            <FoodPage {...props} />
          </TabPanel>
        ) : null}
        {active === "trends" ? (
          <TabPanel id="trends">
            <FoodInsightsRoute />
          </TabPanel>
        ) : null}
        {active === "body" ? (
          <TabPanel id="body">
            <WeightPageRoute />
          </TabPanel>
        ) : null}
        {active === "goal" ? (
          <TabPanel id="goal">
            <DietGoalPanel />
          </TabPanel>
        ) : null}
      </Suspense>
    </div>
  );
}
