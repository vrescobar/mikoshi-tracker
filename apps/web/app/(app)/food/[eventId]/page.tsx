import { notFound } from "next/navigation";

import { FoodDetailPage } from "../../../../components/food/food-detail-page";
import { buildCookieHeader, getFoodEventDetailFromCookieHeader } from "../../../../lib/server-auth";

type FoodEventPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function FoodEventPage({ params }: FoodEventPageProps) {
  const { eventId } = await params;
  const cookieHeader = await buildCookieHeader();
  const event = await getFoodEventDetailFromCookieHeader(cookieHeader, eventId);

  if (!event) {
    notFound();
  }

  return <FoodDetailPage initialEvent={event} />;
}
