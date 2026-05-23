import {
  buildCookieHeader,
  getSessionFromCookieHeader,
  getWeightAggregationsFromCookieHeader,
  getWeightEntryFromCookieHeader,
  listWeightEventsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../lib/server-auth";
import { WeightPage } from "../../../components/weight/weight-page";

function shiftDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function WeightPageRoute() {
  const cookieHeader = await buildCookieHeader();
  const session = await getSessionFromCookieHeader(cookieHeader);
  const today = todayKeyInTimeZone(session?.timezone);
  const from30 = shiftDays(today, -30);

  const [entry, events, aggregations] = await Promise.all([
    getWeightEntryFromCookieHeader(cookieHeader).catch(() => null),
    listWeightEventsFromCookieHeader(cookieHeader, from30, today).catch(() => []),
    getWeightAggregationsFromCookieHeader(cookieHeader, from30, today, "day").catch(() => null),
  ]);

  return (
    <WeightPage
      initialEvents={events}
      initialAggregations={aggregations}
      initialEntryId={entry?.id ?? null}
    />
  );
}
