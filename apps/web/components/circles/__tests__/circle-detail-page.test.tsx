import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as circlesClient from "../../../lib/circles-client";
import { MemoryRouter } from "react-router";

import { LocaleProvider } from "../../locale";
import { CircleDetailPage } from "../circle-detail-page";

vi.mock("../../../lib/circles-client", () => ({
  shareHabit: vi.fn().mockResolvedValue(undefined),
  unshareHabit: vi.fn().mockResolvedValue(undefined),
  listCircleTokens: vi.fn().mockResolvedValue([]),
  addCircleMember: vi.fn().mockResolvedValue({
    membershipId: "mem-new",
    userId: "user-new",
    displayName: "New",
    role: "member",
    externalId: null,
    joinedAt: "2026-01-01T00:00:00.000Z",
  }),
  updateCircleMember: vi.fn().mockResolvedValue({
    membershipId: "mem-1",
    userId: "user-1",
    displayName: "Alice",
    role: "member",
    externalId: null,
    joinedAt: "2026-01-01T00:00:00.000Z",
  }),
  removeCircleMember: vi.fn().mockResolvedValue(undefined),
  mintCircleToken: vi.fn().mockResolvedValue({
    token: "mikoshi_tracker_circle_test",
    tokenId: "tok-1",
    label: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  revokeCircleToken: vi.fn().mockResolvedValue(undefined),
}));

function makeCircle(overrides: { id?: string; name?: string; ownerId?: string } = {}) {
  return {
    id: overrides.id ?? "circle-1",
    name: overrides.name ?? "Test Circle",
    ownerId: overrides.ownerId ?? "user-owner",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeMember(
  overrides: {
    membershipId?: string;
    userId?: string;
    displayName?: string;
    role?: "owner" | "member";
    joinedAt?: string;
  } = {},
) {
  return {
    membershipId: overrides.membershipId ?? "mem-1",
    userId: overrides.userId ?? "user-1",
    displayName: overrides.displayName ?? "Alice",
    role: overrides.role ?? "member",
    externalId: null,
    joinedAt: overrides.joinedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(props: {
  circle?: ReturnType<typeof makeCircle>;
  members?: ReturnType<typeof makeMember>[];
  currentUserId?: string;
  initialHabits?: { id: string; name: string }[];
  mySharedHabits?: { habitId: string; name: string }[];
}) {
  const circle = props.circle ?? makeCircle();
  const members = props.members ?? [];
  return render(
    <MemoryRouter>
      <LocaleProvider initialLocale="en">
        <CircleDetailPage
          initialDetail={{ circle, members, mySharedHabits: props.mySharedHabits ?? [] }}
          currentUserId={props.currentUserId ?? "user-1"}
          initialHabits={props.initialHabits ?? []}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

/** The detail page is tabbed; activate a tab by its accessible name. */
function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("CircleDetailPage — members panel", () => {
  it("renders owner with Owner badge and member with Member badge", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "user-owner", displayName: "Alice", role: "owner" }),
      makeMember({ membershipId: "m2", userId: "user-2", displayName: "Bob", role: "member" }),
    ];
    renderPage({ members, currentUserId: "user-other" });
    openTab(/members/i);

    const panel = screen.getByTestId("circle-members-panel");
    expect(within(panel).getByText("Alice")).toBeInTheDocument();
    expect(within(panel).getByText("Bob")).toBeInTheDocument();
    expect(within(panel).getByText("Owner")).toBeInTheDocument();
    expect(within(panel).getByText("Member")).toBeInTheDocument();
  });

  it("shows the you badge only for the current user", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "user-me", displayName: "Alice", role: "member" }),
      makeMember({ membershipId: "m2", userId: "user-other", displayName: "Bob", role: "member" }),
    ];
    renderPage({ members, currentUserId: "user-me" });
    openTab(/members/i);

    const panel = screen.getByTestId("circle-members-panel");
    expect(within(panel).getAllByText("you")).toHaveLength(1);
    // "you" badge is next to Alice, not Bob
    const aliceCard = within(panel).getByText("Alice").closest("div");
    expect(aliceCard).toHaveTextContent("you");
  });
});

describe("CircleDetailPage — empty state", () => {
  it("shows members empty state when members is empty", () => {
    renderPage({ members: [] });
    openTab(/members/i);
    expect(screen.getByText("No members yet.")).toBeInTheDocument();
  });

  it("shows leaderboard empty state when members is empty", () => {
    renderPage({ members: [] });
    expect(screen.getByText("Add members to see the leaderboard.")).toBeInTheDocument();
  });
});

describe("CircleDetailPage — leaderboard ordering", () => {
  it("lists the owner first, then remaining members alphabetically", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "u-z", displayName: "Zara", role: "member" }),
      makeMember({ membershipId: "m2", userId: "u-o", displayName: "Bob", role: "owner" }),
      makeMember({ membershipId: "m3", userId: "u-a", displayName: "Alice", role: "member" }),
    ];
    renderPage({ members, currentUserId: "user-other" });

    const leaderboard = screen.getByTestId("circle-leaderboard-panel");
    const text = leaderboard.textContent ?? "";
    const bobPos = text.indexOf("Bob");
    const alicePos = text.indexOf("Alice");
    const zaraPos = text.indexOf("Zara");

    expect(bobPos).toBeLessThan(alicePos);
    expect(alicePos).toBeLessThan(zaraPos);
  });
});

describe("CircleDetailPage — habit share panel", () => {
  it("shows empty state when no habits are provided", () => {
    renderPage({ initialHabits: [] });
    openTab(/my shares/i);
    const panel = screen.getByTestId("circle-habit-shares-panel");
    expect(within(panel).getByText("You have no active habits to share.")).toBeInTheDocument();
  });

  it("renders a toggle button for each habit", () => {
    const habits = [
      { id: "h1", name: "Morning run" },
      { id: "h2", name: "Read 30 min" },
    ];
    renderPage({ initialHabits: habits });
    openTab(/my shares/i);
    const panel = screen.getByTestId("circle-habit-shares-panel");
    expect(within(panel).getByText("Morning run")).toBeInTheDocument();
    expect(within(panel).getByText("Read 30 min")).toBeInTheDocument();
  });

  it("marks habits in mySharedHabits as Shared initially", () => {
    const habits = [
      { id: "h1", name: "Morning run" },
      { id: "h2", name: "Read 30 min" },
    ];
    renderPage({
      initialHabits: habits,
      mySharedHabits: [{ habitId: "h1", name: "Morning run" }],
    });
    openTab(/my shares/i);
    const panel = screen.getByTestId("circle-habit-shares-panel");
    const buttons = within(panel).getAllByRole("button");
    const sharedBtn = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(sharedBtn).toBeDefined();
    expect(sharedBtn?.textContent).toBe("Shared");
  });

  it("toggles optimistically when a Share button is clicked", async () => {
    const user = userEvent.setup();
    const habits = [{ id: "h1", name: "Morning run" }];
    renderPage({ initialHabits: habits, mySharedHabits: [] });
    openTab(/my shares/i);
    const panel = screen.getByTestId("circle-habit-shares-panel");
    const btn = within(panel).getByRole("button", { name: "Morning run: Share" });
    await user.click(btn);
    expect(within(panel).getByRole("button", { name: "Morning run: Shared" })).toBeInTheDocument();
  });

  it("rolls back and shows error notice when shareHabit rejects", async () => {
    vi.mocked(circlesClient.shareHabit).mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();
    const habits = [{ id: "h1", name: "Morning run" }];
    renderPage({ initialHabits: habits, mySharedHabits: [] });
    openTab(/my shares/i);
    const panel = screen.getByTestId("circle-habit-shares-panel");
    const btn = within(panel).getByRole("button", { name: "Morning run: Share" });
    await user.click(btn);
    expect(within(panel).getByRole("button", { name: "Morning run: Share" })).toBeInTheDocument();
    expect(screen.getByText("Unable to update")).toBeInTheDocument();
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });
});

describe("CircleDetailPage — hero badge", () => {
  it("shows Owner badge when currentUserId matches circle.ownerId", () => {
    renderPage({
      circle: makeCircle({ ownerId: "user-1" }),
      members: [],
      currentUserId: "user-1",
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows Member badge when currentUserId does not match circle.ownerId", () => {
    renderPage({
      circle: makeCircle({ ownerId: "user-owner" }),
      members: [],
      currentUserId: "user-1",
    });
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("shows Member badge when currentUserId is empty string (no session)", () => {
    renderPage({
      circle: makeCircle({ ownerId: "user-owner" }),
      members: [],
      currentUserId: "",
    });
    expect(screen.getByText("Member")).toBeInTheDocument();
  });
});
