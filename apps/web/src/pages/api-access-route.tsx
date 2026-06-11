import { ApiAccessPanel } from "../../components/api/api-access-panel";
import {
  getAdminRegistrationSettings,
  getApiAccessToken,
} from "../../lib/auth-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { ApiAccessTokenResponse } from "@mikoshi-tracker/contracts/api";

/** Port of app/(app)/api-access/page.tsx. */
export default function ApiAccessRoute() {
  const { user } = useSession();

  const state = usePageData<{
    tokenState: ApiAccessTokenResponse;
    registrationState: { registrationEnabled: boolean } | null;
  }>(async () => {
    const [tokenState, registrationState] = await Promise.all([
      getApiAccessToken(),
      user.isAdmin ? getAdminRegistrationSettings().catch(() => null) : Promise.resolve(null),
    ]);
    return { tokenState, registrationState };
  }, [user.id, user.isAdmin]);

  return (
    <PageBoundary state={state}>
      {(data) => (
        <ApiAccessPanel
          initialTokenState={data.tokenState}
          initialRegistrationState={user.isAdmin ? data.registrationState : null}
        />
      )}
    </PageBoundary>
  );
}
