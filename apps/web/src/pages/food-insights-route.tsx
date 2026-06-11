import { useSearchParams } from "react-router";

import { FoodInsightsPage } from "../../components/food/food-insights-page";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { getFoodAggregations, listFoodEvents } from "../../lib/food-client";
import { useSession } from "../auth/session";
import { RefreshContext, usePageData } from "../lib/use-page-data";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

/** Port of app/(app)/food/insights/page.tsx (searchParams: from, to). */
export default function FoodInsightsRoute() {
  const { timezone } = useSession();
  const [searchParams] = useSearchParams();

  const today = todayKeyInTimeZone(timezone);
  const thirtyDaysAgoKey = shiftDays(today, -29);
  const from = searchParams.get("from") ?? thirtyDaysAgoKey;
  const to = searchParams.get("to") ?? today;

  const { data, loading, refresh } = usePageData<{
    aggregations: AggregationResponse | null;
    events: EntryEventRecord[];
  }>(async () => {
    const [aggregationsResult, eventsResult] = await Promise.allSettled([
      getFoodAggregations(from, to),
      listFoodEvents(from, to),
    ]);
    return {
      aggregations: aggregationsResult.status === "fulfilled" ? aggregationsResult.value : null,
      events: eventsResult.status === "fulfilled" ? eventsResult.value.items : [],
    };
  }, [from, to]);

  if (loading || !data) {
    return null;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <FoodInsightsPage
        initialAggregations={data.aggregations}
        initialEvents={data.events}
        initialFrom={from}
        initialTo={to}
      />
    </RefreshContext.Provider>
  );
}
