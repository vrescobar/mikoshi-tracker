import {
  buildCookieHeader,
  getSessionFromCookieHeader,
  listFoodEventsFromCookieHeader,
  todayKeyInTimeZone,
} from "../../../lib/server-auth";
import { FoodPage } from "../../../components/food/food-page";

export default async function FoodPageRoute() {
  const cookieHeader = await buildCookieHeader();
  const session = await getSessionFromCookieHeader(cookieHeader);
  const today = todayKeyInTimeZone(session?.timezone);
  const events = await listFoodEventsFromCookieHeader(cookieHeader, today, today);

  return <FoodPage initialEvents={events} dateKey={today} timeZone={session?.timezone} />;
}
