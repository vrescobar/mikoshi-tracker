import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { FoodDayResponse } from "@mikoshi-tracker/contracts/food";

import { DietPage } from "../../components/food/diet-page";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { getFoodDay } from "../../lib/diet-client";
import { getFoodAggregations } from "../../lib/food-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/** Diet hub: Today (summary + meals), Explore, Body, Goal. */
export default function FoodPageRoute() {
  const { timezone } = useSession();
  const today = todayKeyInTimeZone(timezone);
  const from7 = shiftDays(today, -6);

  const state = usePageData<{
    day: FoodDayResponse;
    trend: AggregationResponse | null;
  }>(async () => {
    const [day, trend] = await Promise.all([
      getFoodDay(today),
      getFoodAggregations(from7, today, "day").catch(() => null),
    ]);
    return { day, trend };
  }, [today, timezone]);

  return (
    <PageBoundary state={state}>
      {(data) => <DietPage day={data.day} trend={data.trend} dateKey={today} timeZone={timezone} />}
    </PageBoundary>
  );
}
