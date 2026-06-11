import { ApiAccessPanel } from "../../components/api/api-access-panel";
import {
  getAdminRegistrationSettings,
  getApiAccessToken,
} from "../../lib/auth-client";
import { useSession } from "../auth/session";
import { RefreshContext, usePageData } from "../lib/use-page-data";

import type { ApiAccessTokenResponse } from "@mikoshi-tracker/contracts/api";

/** Port of app/(app)/api-access/page.tsx. */
export default function ApiAccessRoute() {
  const { user } = useSession();

  const { data, loading, refresh } = usePageData<{
    tokenState: ApiAccessTokenResponse;
    registrationState: { registrationEnabled: boolean } | null;
  }>(async () => {
    const [tokenState, registrationState] = await Promise.all([
      getApiAccessToken(),
      user.isAdmin ? getAdminRegistrationSettings().catch(() => null) : Promise.resolve(null),
    ]);
    return { tokenState, registrationState };
  }, [user.id, user.isAdmin]);

  if (loading || !data) {
    return null;
  }

  return (
    <RefreshContext.Provider value={refresh}>
      <ApiAccessPanel
        initialTokenState={data.tokenState}
        initialRegistrationState={user.isAdmin ? data.registrationState : null}
      />
    </RefreshContext.Provider>
  );
}
