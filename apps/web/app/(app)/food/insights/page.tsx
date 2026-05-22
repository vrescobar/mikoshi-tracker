import {
  buildCookieHeader,
  getFoodAggregationsFromCookieHeader,
  listFoodEventsFromCookieHeader,
} from "../../../../lib/server-auth";
import { FoodInsightsPage } from "../../../../components/food/food-insights-page";

type InsightsPageProps = {
  searchParams?: Promise<{ from?: string; to?: string }>;
};

export default async function FoodInsightsPageRoute({ searchParams }: InsightsPageProps) {
  const params = searchParams ? await searchParams : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const from = params?.from ?? thirtyDaysAgo;
  const to = params?.to ?? today;

  const cookieHeader = await buildCookieHeader();

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
