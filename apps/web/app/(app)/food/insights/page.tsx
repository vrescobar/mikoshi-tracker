import {
  buildCookieHeader,
  getFoodAggregationsFromCookieHeader,
  getSessionFromCookieHeader,
  listFoodEventsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../../lib/server-auth";
import { FoodInsightsPage } from "../../../../components/food/food-insights-page";

type InsightsPageProps = {
  searchParams?: Promise<{ from?: string; to?: string }>;
};

export default async function FoodInsightsPageRoute({ searchParams }: InsightsPageProps) {
  const params = searchParams ? await searchParams : undefined;

  const cookieHeader = await buildCookieHeader();
  const session = await getSessionFromCookieHeader(cookieHeader);
  const today = todayKeyInTimeZone(session?.timezone);
  const thirtyDaysAgo = new Date(`${today}T00:00:00.000Z`);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  const thirtyDaysAgoKey = thirtyDaysAgo.toISOString().slice(0, 10);

  const from = params?.from ?? thirtyDaysAgoKey;
  const to = params?.to ?? today;

  const [aggregations, eventsResult] = await Promise.allSettled([
    getFoodAggregationsFromCookieHeader(cookieHeader, from, to),
    listFoodEventsFromCookieHeader(cookieHeader, from, to),
  ]);

  const initialAggregations = aggregations.status === "fulfilled" ? aggregations.value : null;
  const initialEvents = eventsResult.status === "fulfilled" ? eventsResult.value : [];

  return (
    <FoodInsightsPage
      initialAggregations={initialAggregations}
      initialEvents={initialEvents}
      initialFrom={from}
      initialTo={to}
    />
  );
}
