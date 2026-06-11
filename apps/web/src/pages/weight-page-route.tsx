import { WeightPage } from "../../components/weight/weight-page";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import {
  getWeightAggregations,
  getWeightEntry,
  listWeightEvents,
} from "../../lib/weight-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

/** Port of app/(app)/weight/page.tsx. */
export default function WeightPageRoute() {
  const { timezone } = useSession();
  const today = todayKeyInTimeZone(timezone);
  const from30 = shiftDays(today, -30);

  const state = usePageData<{
    entryId: string | null;
    events: EntryEventRecord[];
    aggregations: AggregationResponse | null;
  }>(async () => {
    const [entry, events, aggregations] = await Promise.all([
      getWeightEntry().catch(() => null),
      listWeightEvents(from30, today).catch(() => null),
      getWeightAggregations(from30, today, "day").catch(() => null),
    ]);
    return {
      entryId: entry?.id ?? null,
      events: events?.items ?? [],
      aggregations,
    };
  }, [today]);

  return (
    <PageBoundary state={state}>
      {(data) => (
        <WeightPage
          initialEvents={data.events}
          initialAggregations={data.aggregations}
          initialEntryId={data.entryId}
        />
      )}
    </PageBoundary>
  );
}
