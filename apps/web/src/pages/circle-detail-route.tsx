import { useParams } from "react-router";

import { CircleDetailPage } from "../../components/circles/circle-detail-page";
import { CircleDetailSkeleton } from "../../components/circles/circle-detail-skeleton";
import { listHabits } from "../../lib/auth-client";
import { getCircleDetail } from "../../lib/circles-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { CircleDetailResponse } from "@mikoshi-tracker/contracts/circles";

/** Port of app/(app)/circles/[circleId]/page.tsx. 404 → NotFound; other errors surface. */
export default function CircleDetailRoute() {
  const { circleId = "" } = useParams<{ circleId: string }>();
  const { user } = useSession();

  const state = usePageData<{
    detail: CircleDetailResponse;
    habits: { id: string; name: string }[];
  }>(async () => {
    const [detail, habits] = await Promise.all([
      getCircleDetail(circleId),
      listHabits({ status: "active" }).catch(() => []),
    ]);
    return {
      detail,
      habits: habits.map((habit) => ({ id: habit.id, name: habit.name })),
    };
  }, [circleId]);

  return (
    <PageBoundary state={state} skeleton={<CircleDetailSkeleton />} notFoundOn404>
      {(data) => (
        <CircleDetailPage
          initialDetail={data.detail}
          currentUserId={user.id}
          initialHabits={data.habits}
        />
      )}
    </PageBoundary>
  );
}
