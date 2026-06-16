/**
 * The legacy /habits/* routes must keep forwarding to the entries view —
 * replacement for the old Next server-page redirect test, exercised against
 * the real route table with a memory router.
 */
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { LocaleProvider } from "../../components/locale";
import { routeConfig } from "../router";

vi.mock("../../lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth-client")>();
  return {
    ...actual,
    getSession: vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", name: "A", isAdmin: false },
      timezone: "UTC",
    }),
  };
});

const TARGET = "/entries?entryTypeSlug=habit_boolean,habit_quantity";

describe("habits routes — redirect to entries", () => {
  // /habits itself now renders the Habits overview page; only the legacy
  // new/detail sub-routes still forward to the entries view.
  for (const path of ["/habits/new", "/habits/some-id"]) {
    it(`${path} redirects to ${TARGET}`, async () => {
      const router = createMemoryRouter(routeConfig, { initialEntries: [path] });
      render(
        <LocaleProvider initialLocale="en">
          <RouterProvider router={router} />
        </LocaleProvider>,
      );

      await waitFor(() => {
        expect(router.state.location.pathname + router.state.location.search).toBe(TARGET);
      });
    });
  }
});
