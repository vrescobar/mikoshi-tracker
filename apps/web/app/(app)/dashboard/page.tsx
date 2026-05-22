import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import {
  buildCookieHeader,
  getFoodAggregationsFromCookieHeader,
  getOverviewStatsFromCookieHeader,
  getSessionFromCookieHeader,
  getTodaySummaryFromCookieHeader,
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

  const [[activeHabits, archivedHabits], foodAggregationsResult] = await Promise.all([
    Promise.all([
      listHabitsFromCookieHeader(cookieHeader, { status: "active" }),
      listHabitsFromCookieHeader(cookieHeader, { status: "archived" }),
    ]),
    getFoodAggregationsFromCookieHeader(cookieHeader, today, today).catch(() => null),
  ]);

  const emptyState = activeHabits.length === 0 ? (archivedHabits.length > 0 ? "archived-only" : "no-habits") : null;

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
