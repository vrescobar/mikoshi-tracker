import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import {
  buildCookieHeader,
  getFoodAggregationsFromCookieHeader,
  getOverviewStatsFromCookieHeader,
  getSessionFromCookieHeader,
  getTodaySummaryFromCookieHeader,
  listEntriesFromCookieHeader,
  listHabitsFromCookieHeader,
  listWeightEventsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../lib/server-auth";
import { isWeightPayload } from "../../../lib/weight-client";

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

  function shiftDays(dateKey: string, days: number): string {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  const from30 = shiftDays(today, -30);

  const [[activeHabits, archivedHabits], foodAggregationsResult, foodEntries, latestWeightEvents] = await Promise.all([
    Promise.all([
      listHabitsFromCookieHeader(cookieHeader, { status: "active" }),
      listHabitsFromCookieHeader(cookieHeader, { status: "archived" }),
    ]),
    getFoodAggregationsFromCookieHeader(cookieHeader, today, today).catch(() => null),
    listEntriesFromCookieHeader(cookieHeader, { entryTypeSlug: "food_meal", isActive: true }).catch(
      () => [],
    ),
    listWeightEventsFromCookieHeader(cookieHeader, from30, today).catch(() => []),
  ]);

  const latestWeightEvent = [...latestWeightEvents].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0] ?? null;
  const latestWeightKg = latestWeightEvent && isWeightPayload(latestWeightEvent.payload)
    ? latestWeightEvent.payload.weight_kg
    : null;
  const latestWeightDate = latestWeightEvent?.dateKey ?? null;

  const foodEventsToday = foodAggregationsResult?.total.count ?? 0;
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
    foodEntryWithTarget && typeof (foodEntryWithTarget.config as { dailyKcalTarget?: number | null } | null)?.dailyKcalTarget === "number"
      ? ((foodEntryWithTarget.config as { dailyKcalTarget: number }).dailyKcalTarget)
      : null;

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
      foodEntryId={foodEntryId}
      dailyKcalTarget={dailyKcalTarget}
      latestWeightKg={latestWeightKg}
      latestWeightDate={latestWeightDate}
    />
  );
}
