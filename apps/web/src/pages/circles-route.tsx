import { CirclesPage } from "../../components/circles/circles-page";
import { CirclesSkeleton } from "../../components/circles/circles-skeleton";
import { listCircles } from "../../lib/circles-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { CircleRecord } from "@mikoshi-tracker/contracts/circles";

/** Port of app/(app)/circles/page.tsx. Failures surface instead of faking an empty list. */
export default function CirclesRoute() {
  const { user } = useSession();

  const state = usePageData<CircleRecord[]>(() => listCircles(), []);

  return (
    <PageBoundary state={state} skeleton={<CirclesSkeleton />}>
      {(items) => <CirclesPage initialItems={items} currentUserId={user.id} />}
    </PageBoundary>
  );
}
