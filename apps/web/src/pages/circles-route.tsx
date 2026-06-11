import { CirclesPage } from "../../components/circles/circles-page";
import { CirclesSkeleton } from "../../components/circles/circles-skeleton";
import { listCircles } from "../../lib/circles-client";
import { useSession } from "../auth/session";
import { RefreshContext, usePageData } from "../lib/use-page-data";

import type { CircleRecord } from "@mikoshi-tracker/contracts/circles";

/** Port of app/(app)/circles/page.tsx. */
export default function CirclesRoute() {
  const { user } = useSession();

  const { data, loading, refresh } = usePageData<CircleRecord[]>(
    () => listCircles().catch(() => []),
    [],
  );

  if (loading || !data) {
    return <CirclesSkeleton />;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <CirclesPage initialItems={data} currentUserId={user.id} />
    </RefreshContext.Provider>
  );
}
