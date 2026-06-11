import { PageFrame, StatePanel } from "../../components/ui";
import { useSession } from "../auth/session";
import { AdminShell } from "./admin-shell";

/**
 * Gate for the /admin subtree: requires the signed-in session to carry the
 * isAdmin flag (the API enforces the same flag server-side — this only keeps
 * non-admins from seeing a UI whose every call would 401).
 */
export function AdminGuard() {
  const { user } = useSession();

  if (!user.isAdmin) {
    return (
      <PageFrame>
        <StatePanel
          tone="danger"
          eyebrow="403"
          title="Admin access required"
          description="Your account does not have the admin flag, so this area is unavailable."
          testId="admin-forbidden"
        />
      </PageFrame>
    );
  }

  return <AdminShell />;
}
