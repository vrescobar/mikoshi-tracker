import { createContext, useContext } from "react";

import type { SessionPayload } from "../../lib/auth-client";

export type SessionContextValue = {
  user: SessionPayload["user"];
  timezone: string | undefined;
  impersonating: SessionPayload["impersonating"];
  /** Re-fetch the session (e.g. after profile changes or god-mode toggles). */
  refresh: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = SessionContext.Provider;

/** Session of the signed-in user. Only usable under ProtectedLayout. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside ProtectedLayout");
  }
  return value;
}
