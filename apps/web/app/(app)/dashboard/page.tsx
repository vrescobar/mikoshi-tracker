import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import {
  buildCookieHeader,
  getFoodAggregationsFromCookieHeader,
  getOverviewStatsFromCookieHeader,
  getSessionFromCookieHeader,
  getTodaySummaryFromCookieHeader,
  listEntriesFromCookieHeader,
  listHabitsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../lib/server-auth";

type DashboardPageProps = {
  searchParams?: Promise<{
    simulateLoading?: string;
    simulateTodayError?: string;
    simulateOverviewError?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : undefined;

  if (params?.simulateLoading === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const cookieHeader = await buildCookieHeader();
  const session = await getSessionFromCookieHeader(cookieHeader);
  const today = todayKeyInTimeZone(session?.timezone);

  const [[activeHabits, archivedHabits], foodAggregationsResult, foodEntries] = await Promise.all([
    Promise.all([
      listHabitsFromCookieHeader(cookieHeader, { status: "active" }),
      listHabitsFromCookieHeader(cookieHeader, { status: "archived" }),
    ]),
    getFoodAggregationsFromCookieHeader(cookieHeader, today, today).catch(() => null),
    listEntriesFromCookieHeader(cookieHeader, { entryTypeSlug: "food_meal", isActive: true }).catch(
      () => [],
    ),
  ]);

  const foodEventsToday = foodAggregationsResult?.total.count ?? 0;
  const hasAnyFood = foodEntries.length > 0 || foodEventsToday > 0;

  const emptyState: "no-entries" | "habits-empty" | "archived-only" | null =
    activeHabits.length === 0
      ? hasAnyFood
        ? "habits-empty"
        : archivedHabits.length > 0
          ? "archived-only"
          : "no-entries"
      : null;

  let initialSummary = null;
  let initialOverview = null;
  let initialLoadError: string | null = null;

  if (!emptyState) {
    if (params?.simulateTodayError === "1" || params?.simulateOverviewError === "1") {
      initialLoadError = "Unable to load today and overview right now.";
    } else {
      const [todaySummaryResult, overviewResult] = await Promise.allSettled([
        getTodaySummaryFromCookieHeader(cookieHeader),
        getOverviewStatsFromCookieHeader(cookieHeader),
      ]);

      initialSummary = todaySummaryResult.status === "fulfilled" ? todaySummaryResult.value : null;
      initialOverview = overviewResult.status === "fulfilled" ? overviewResult.value : null;
    }
  }

  return (
    <DashboardShell
      emptyState={emptyState}
      initialLoadError={initialLoadError}
      initialOverview={initialOverview}
      initialSummary={initialSummary}
      initialFoodTodayAggregations={foodAggregationsResult}
    />
  );
}
