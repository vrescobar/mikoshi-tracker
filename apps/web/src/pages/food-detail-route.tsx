import { useParams } from "react-router";

import { FoodDetailPage } from "../../components/food/food-detail-page";
import { getFoodEventDetail, type FoodEventDetail } from "../../lib/food-client";
import { RefreshContext, usePageData } from "../lib/use-page-data";
import NotFoundPage from "./not-found";

/** Port of app/(app)/food/[eventId]/page.tsx. */
export default function FoodDetailRoute() {
  const { eventId = "" } = useParams<{ eventId: string }>();

  const { data, loading, error, refresh } = usePageData<FoodEventDetail | null>(
    () => getFoodEventDetail(eventId).catch(() => null),
    [eventId],
  );

  if (loading) {
    return null;
  }

  if (error || !data) {
    return <NotFoundPage />;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <FoodDetailPage initialEvent={data} />
    </RefreshContext.Provider>
  );
}
