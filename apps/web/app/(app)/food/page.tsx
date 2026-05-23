import {
  buildCookieHeader,
  getRepeatedFoodMealsFromCookieHeader,
  getSessionFromCookieHeader,
  listFoodEventsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../lib/server-auth";
import { FoodPage } from "../../../components/food/food-page";

function shiftDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function FoodPageRoute() {
  const cookieHeader = await buildCookieHeader();
  const session = await getSessionFromCookieHeader(cookieHeader);
  const today = todayKeyInTimeZone(session?.timezone);
  const from30 = shiftDays(today, -30);

  const [events, repeats] = await Promise.all([
    listFoodEventsFromCookieHeader(cookieHeader, today, today),
    getRepeatedFoodMealsFromCookieHeader(cookieHeader, from30, today, 5).catch(() => null),
  ]);

  return (
    <FoodPage
      initialEvents={events}
      dateKey={today}
      timeZone={session?.timezone}
      initialRepeats={repeats}
    />
  );
}
