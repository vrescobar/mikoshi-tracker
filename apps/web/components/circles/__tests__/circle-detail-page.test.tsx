import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { CircleDetailPage } from "../circle-detail-page";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
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
    role: (overrides.role ?? "member") as "owner" | "member",
    externalId: null,
    joinedAt: overrides.joinedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(props: {
  circle?: ReturnType<typeof makeCircle>;
  members?: ReturnType<typeof makeMember>[];
  currentUserId?: string;
}) {
  const circle = props.circle ?? makeCircle();
  const members = props.members ?? [];
  return render(
    <LocaleProvider initialLocale="en">
      <CircleDetailPage
        initialDetail={{ circle, members, mySharedHabits: [] }}
        currentUserId={props.currentUserId ?? "user-1"}
      />
    </LocaleProvider>,
  );
}

describe("CircleDetailPage — members panel", () => {
  it("renders owner with Owner badge and member with Member badge", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "user-owner", displayName: "Alice", role: "owner" }),
      makeMember({ membershipId: "m2", userId: "user-2", displayName: "Bob", role: "member" }),
    ];
    renderPage({ members, currentUserId: "user-other" });

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
