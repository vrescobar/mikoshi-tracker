import { useSearchParams } from "react-router";

import { DashboardSkeleton } from "../../components/dashboard/dashboard-skeleton";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import {
  getOverviewStats,
  getTodaySummary,
  listHabits,
} from "../../lib/auth-client";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { listEntries } from "../../lib/entries-client";
import { getFoodAggregations } from "../../lib/food-client";
import { isWeightPayload, listWeightEvents } from "../../lib/weight-client";
import { useSession } from "../auth/session";
import { RefreshContext, usePageData } from "../lib/use-page-data";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { OverviewStats } from "@mikoshi-tracker/contracts/stats";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

type DashboardData = {
  emptyState: "no-entries" | "habits-empty" | "archived-only" | null;
  initialLoadError: string | null;
  initialSummary: TodaySummary | null;
  initialOverview: OverviewStats | null;
  foodAggregations: AggregationResponse | null;
  foodEntryId: string | null;
  dailyKcalTarget: number | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
};

/** Port of app/(app)/dashboard/page.tsx, including the e2e simulate params. */
export default function DashboardPage() {
  const { timezone } = useSession();
  const [searchParams] = useSearchParams();
  const simulateLoading = searchParams.get("simulateLoading") === "1";
  const simulateError =
    searchParams.get("simulateTodayError") === "1" ||
    searchParams.get("simulateOverviewError") === "1";

  const { data, loading, refresh } = usePageData<DashboardData>(async () => {
    if (simulateLoading) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const today = todayKeyInTimeZone(timezone);
    const from30 = shiftDays(today, -30);

    const [[activeHabits, archivedHabits], foodAggregations, foodEntries, weightEventsResult] =
      await Promise.all([
        Promise.all([listHabits({ status: "active" }), listHabits({ status: "archived" })]),
        getFoodAggregations(today, today).catch(() => null),
        listEntries({ entryTypeSlug: "food_meal", isActive: true }).catch(() => []),
        listWeightEvents(from30, today).catch(() => null),
      ]);

    const latestWeightEvent =
      [...(weightEventsResult?.items ?? [])].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )[0] ?? null;
    const latestWeightKg =
      latestWeightEvent && isWeightPayload(latestWeightEvent.payload)
        ? latestWeightEvent.payload.weight_kg
        : null;
    const latestWeightDate = latestWeightEvent?.dateKey ?? null;

    const foodEventsToday = foodAggregations?.total.count ?? 0;
    const hasAnyFood = foodEntries.length > 0 || foodEventsToday > 0;

    // Resolve the user's optional daily kcal target from the food_meal Entry
    // config. Multiple food_meal entries would each carry their own target;
    // V1 honors the first active entry only.
    const foodEntryWithTarget = foodEntries.find((entry) => {
      const config = entry.config as { dailyKcalTarget?: number | null } | null;
      return typeof config?.dailyKcalTarget === "number" && config.dailyKcalTarget > 0;
    });
    const foodEntryId = foodEntries[0]?.id ?? null;
    const dailyKcalTarget =
      foodEntryWithTarget &&
      typeof (foodEntryWithTarget.config as { dailyKcalTarget?: number | null } | null)
        ?.dailyKcalTarget === "number"
        ? (foodEntryWithTarget.config as { dailyKcalTarget: number }).dailyKcalTarget
        : null;

    const emptyState: DashboardData["emptyState"] =
      activeHabits.length === 0
        ? hasAnyFood
          ? "habits-empty"
          : archivedHabits.length > 0
            ? "archived-only"
            : "no-entries"
        : null;

    let initialSummary: TodaySummary | null = null;
    let initialOverview: OverviewStats | null = null;
    let initialLoadError: string | null = null;

    if (!emptyState) {
      if (simulateError) {
        initialLoadError = "Unable to load today and overview right now.";
      } else {
        const [todaySummaryResult, overviewResult] = await Promise.allSettled([
          getTodaySummary(),
          getOverviewStats(),
        ]);

        initialSummary =
          todaySummaryResult.status === "fulfilled" ? todaySummaryResult.value : null;
        initialOverview =
          overviewResult.status === "fulfilled" ? overviewResult.value : null;
      }
    }

    return {
      emptyState,
      initialLoadError,
      initialSummary,
      initialOverview,
      foodAggregations,
      foodEntryId,
      dailyKcalTarget,
      latestWeightKg,
      latestWeightDate,
    };
  }, [timezone, simulateLoading, simulateError]);

  if (loading || !data) {
    return <DashboardSkeleton />;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <DashboardShell
        emptyState={data.emptyState}
        initialLoadError={data.initialLoadError}
        initialOverview={data.initialOverview}
        initialSummary={data.initialSummary}
        initialFoodTodayAggregations={data.foodAggregations}
        foodEntryId={data.foodEntryId}
        dailyKcalTarget={data.dailyKcalTarget}
        latestWeightKg={data.latestWeightKg}
        latestWeightDate={data.latestWeightDate}
      />
    </RefreshContext.Provider>
  );
}
