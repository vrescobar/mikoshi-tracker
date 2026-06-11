import { FoodPage } from "../../components/food/food-page";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { getRepeatedFoodMeals, listFoodEvents } from "../../lib/food-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

/** Port of app/(app)/food/page.tsx. */
export default function FoodPageRoute() {
  const { timezone } = useSession();
  const today = todayKeyInTimeZone(timezone);
  const from30 = shiftDays(today, -30);

  const state = usePageData<{
    events: EntryEventRecord[];
    repeats: AggregationResponse | null;
  }>(async () => {
    const [events, repeats] = await Promise.all([
      listFoodEvents(today, today),
      getRepeatedFoodMeals(from30, today, 5).catch(() => null),
    ]);
    return { events: events.items, repeats };
  }, [today, timezone]);

  return (
    <PageBoundary state={state}>
      {(data) => (
        <FoodPage
          initialEvents={data.events}
          dateKey={today}
          timeZone={timezone}
          initialRepeats={data.repeats}
        />
      )}
    </PageBoundary>
  );
}
