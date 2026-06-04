// Mirrors apps/api/src/auth/impersonation.ts ACT_AS_HEADER — the god-mode header
// that runs a v1 bearer route as the named user when an admin key is presented.
export const ACT_AS_HEADER = "x-act-as-user";
