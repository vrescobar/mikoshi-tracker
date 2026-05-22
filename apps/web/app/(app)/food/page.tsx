import { buildCookieHeader, listFoodEventsFromCookieHeader } from "../../../lib/server-auth";
import { FoodPage } from "../../../components/food/food-page";

export default async function FoodPageRoute() {
  const cookieHeader = await buildCookieHeader();
  const today = new Date().toISOString().slice(0, 10);
  const events = await listFoodEventsFromCookieHeader(cookieHeader, today, today);

  return <FoodPage initialEvents={events} dateKey={today} />;
}
