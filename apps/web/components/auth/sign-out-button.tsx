"use client";

import { useNavigate } from "react-router";
import { useTransition } from "react";

import { signOut } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";
import { Button } from "../ui";

export function SignOutButton({ label = "Log out" }: { label?: string }) {
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          void navigate(routes.auth);
        })
      }
    >
      {label}
    </Button>
  );
}
