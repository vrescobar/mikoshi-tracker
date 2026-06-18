import { useSearchParams } from "react-router";

import { FoodInsightsPage } from "../../components/food/food-insights-page";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { getDietGoal } from "../../lib/diet-client";
import { getFoodAggregations, listFoodEvents } from "../../lib/food-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

/** Port of app/(app)/food/insights/page.tsx (searchParams: from, to). */
export default function FoodInsightsRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { timezone } = useSession();
  const [searchParams] = useSearchParams();

  const today = todayKeyInTimeZone(timezone);
  const thirtyDaysAgoKey = shiftDays(today, -29);
  const from = searchParams.get("from") ?? thirtyDaysAgoKey;
  const to = searchParams.get("to") ?? today;

  const state = usePageData<{
    aggregations: AggregationResponse | null;
    events: EntryEventRecord[];
    goalKcalTarget: number | null;
  }>(async () => {
    const [aggregationsResult, eventsResult, goalResult] = await Promise.allSettled([
      getFoodAggregations(from, to),
      listFoodEvents(from, to),
      getDietGoal(),
    ]);
    return {
      aggregations: aggregationsResult.status === "fulfilled" ? aggregationsResult.value : null,
      events: eventsResult.status === "fulfilled" ? eventsResult.value.items : [],
      goalKcalTarget:
        goalResult.status === "fulfilled" ? (goalResult.value?.kcalTarget ?? null) : null,
    };
  }, [from, to]);

  return (
    <PageBoundary state={state}>
      {(data) => (
        <FoodInsightsPage
          initialAggregations={data.aggregations}
          initialEvents={data.events}
          initialFrom={from}
          initialTo={to}
          goalKcalTarget={data.goalKcalTarget}
          embedded={embedded}
        />
      )}
    </PageBoundary>
  );
}
