import { useParams } from "react-router";

import { CircleDetailPage } from "../../components/circles/circle-detail-page";
import { CircleDetailSkeleton } from "../../components/circles/circle-detail-skeleton";
import { listHabits } from "../../lib/auth-client";
import { getCircleDetail } from "../../lib/circles-client";
import { useSession } from "../auth/session";
import { RefreshContext, usePageData } from "../lib/use-page-data";
import NotFoundPage from "./not-found";

import type { CircleDetailResponse } from "@mikoshi-tracker/contracts/circles";

/** Port of app/(app)/circles/[circleId]/page.tsx. */
export default function CircleDetailRoute() {
  const { circleId = "" } = useParams<{ circleId: string }>();
  const { user } = useSession();

  const { data, loading, refresh } = usePageData<{
    detail: CircleDetailResponse | null;
    habits: { id: string; name: string }[];
  }>(async () => {
    const [detail, habits] = await Promise.all([
      getCircleDetail(circleId).catch(() => null),
      listHabits({ status: "active" }).catch(() => []),
    ]);
    return {
      detail,
      habits: habits.map((habit) => ({ id: habit.id, name: habit.name })),
    };
  }, [circleId]);

  if (loading) {
    return <CircleDetailSkeleton />;
  }

  if (!data?.detail) {
    return <NotFoundPage />;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <CircleDetailPage
        initialDetail={data.detail}
        currentUserId={user.id}
        initialHabits={data.habits}
      />
    </RefreshContext.Provider>
  );
}
