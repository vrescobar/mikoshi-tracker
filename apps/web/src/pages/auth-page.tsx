import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { AuthPageContent } from "../../components/auth/auth-page-content";
import { getRegistrationStatus, getSession, listHabits } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";

/**
 * Port of app/(auth)/page.tsx: with a session, redirect into the app (the
 * "no habits yet" branch goes to /habits/new, which the router immediately
 * forwards to the entries view — preserving the old chain); without one,
 * show the auth form with the registration toggle state.
 */
export default function AuthPage() {
  const navigate = useNavigate();
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getSession().catch(() => null);
      if (cancelled) return;

      if (session) {
        const habits = await listHabits().catch(() => []);
        if (cancelled) return;
        await navigate(habits.length === 0 ? routes.newHabit : routes.dashboard, {
          replace: true,
        });
        return;
      }

      const registration = await getRegistrationStatus().catch(() => ({
        registrationEnabled: false,
        hasUsers: true,
      }));
      if (!cancelled) {
        setRegistrationEnabled(registration.registrationEnabled);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (registrationEnabled === null) {
    return null;
  }

  return <AuthPageContent registrationEnabled={registrationEnabled} />;
}
