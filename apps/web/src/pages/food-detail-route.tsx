import { useParams } from "react-router";

import { FoodDetailPage } from "../../components/food/food-detail-page";
import { getFoodEventDetail, type FoodEventDetail } from "../../lib/food-client";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/** Port of app/(app)/food/[eventId]/page.tsx. 404 → NotFound; other errors surface. */
export default function FoodDetailRoute() {
  const { eventId = "" } = useParams<{ eventId: string }>();

  const state = usePageData<FoodEventDetail>(() => getFoodEventDetail(eventId), [eventId]);

  return (
    <PageBoundary state={state} notFoundOn404>
      {(event) => <FoodDetailPage initialEvent={event} />}
    </PageBoundary>
  );
}
