import type { CircleMember, CircleTokenMeta } from "@haaabit/contracts/circles";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import * as circlesClient from "../../../lib/circles-client";
import { LocaleProvider } from "../../locale";
import { CircleOwnerPanel } from "../circle-owner-panel";

vi.mock("../../../lib/circles-client", () => ({
  addCircleMember: vi.fn(),
  updateCircleMember: vi.fn(),
  removeCircleMember: vi.fn(),
  listCircleTokens: vi.fn(),
  mintCircleToken: vi.fn(),
  revokeCircleToken: vi.fn(),
}));

function makeMember(
  overrides: {
    membershipId?: string;
    userId?: string;
    displayName?: string;
    role?: "owner" | "member";
    externalId?: string | null;
  } = {},
): CircleMember {
  return {
    membershipId: overrides.membershipId ?? "mem-1",
    userId: overrides.userId ?? "user-1",
    displayName: overrides.displayName ?? "Alice",
    role: overrides.role ?? "member",
    externalId: overrides.externalId ?? null,
    joinedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeToken(overrides: { tokenId?: string; label?: string | null } = {}): CircleTokenMeta {
  return {
    tokenId: overrides.tokenId ?? "tok-1",
    label: overrides.label ?? "Test bot",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
  };
}

function renderPanel(props: {
  circleId?: string;
  currentUserId?: string;
  members?: CircleMember[];
  onMembersChange?: (m: CircleMember[]) => void;
}) {
  const onMembersChange = props.onMembersChange ?? vi.fn();
  return {
    onMembersChange,
    ...render(
      <LocaleProvider initialLocale="en">
        <CircleOwnerPanel
          circleId={props.circleId ?? "circle-1"}
          currentUserId={props.currentUserId ?? "user-owner"}
          members={props.members ?? []}
          onMembersChange={onMembersChange}
        />
      </LocaleProvider>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(circlesClient.listCircleTokens).mockResolvedValue([]);
  vi.mocked(circlesClient.addCircleMember).mockResolvedValue(
    makeMember({ membershipId: "mem-new", userId: "user-new", displayName: "New Person" }),
  );
  vi.mocked(circlesClient.updateCircleMember).mockResolvedValue(makeMember());
  vi.mocked(circlesClient.removeCircleMember).mockResolvedValue();
  vi.mocked(circlesClient.mintCircleToken).mockResolvedValue({
    token: "haaabit_circle_abc123",
    tokenId: "tok-new",
    label: "My bot",
    createdAt: "2026-02-01T00:00:00.000Z",
  });
  vi.mocked(circlesClient.revokeCircleToken).mockResolvedValue();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("CircleOwnerPanel — member management", () => {
  it("renders the add member form with email and external ID fields", () => {
    renderPanel({});
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/external id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add member/i })).toBeInTheDocument();
  });

  it("submit button is disabled when email is empty", () => {
    renderPanel({});
    const btn = screen.getByRole("button", { name: /add member/i });
    expect(btn).toBeDisabled();
  });

  it("calls addCircleMember and invokes onMembersChange on success", async () => {
    const user = userEvent.setup();
    const onMembersChange = vi.fn();
    renderPanel({ members: [], onMembersChange });

    await user.type(screen.getByLabelText(/email address/i), "new@test.com");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    expect(circlesClient.addCircleMember).toHaveBeenCalledWith("circle-1", {
      email: "new@test.com",
      externalId: undefined,
    });
    expect(onMembersChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ displayName: "New Person" })]),
    );
  });

  it("shows an error notice when addCircleMember fails", async () => {
    vi.mocked(circlesClient.addCircleMember).mockRejectedValueOnce(new Error("Not found"));
    const user = userEvent.setup();
    renderPanel({});

    await user.type(screen.getByLabelText(/email address/i), "bad@test.com");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("renders each member in the manage list", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "u1", displayName: "Alice" }),
      makeMember({ membershipId: "m2", userId: "u2", displayName: "Bob" }),
    ];
    renderPanel({ members });

    const list = screen.getByTestId("owner-manage-members-list");
    expect(within(list).getByText("Alice")).toBeInTheDocument();
    expect(within(list).getByText("Bob")).toBeInTheDocument();
  });

  it("does not show a Remove button for the current user", () => {
    const members = [
      makeMember({ membershipId: "m1", userId: "user-owner", displayName: "Alice", role: "owner" }),
      makeMember({ membershipId: "m2", userId: "user-other", displayName: "Bob" }),
    ];
    renderPanel({ currentUserId: "user-owner", members });

    const list = screen.getByTestId("owner-manage-members-list");
    const removeButtons = within(list).getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("calls removeCircleMember and updates members list after confirmation", async () => {
    const user = userEvent.setup();
    const bob = makeMember({ membershipId: "m-bob", userId: "user-bob", displayName: "Bob" });
    const onMembersChange = vi.fn();
    renderPanel({
      currentUserId: "user-owner",
      members: [makeMember({ membershipId: "m-owner", userId: "user-owner", role: "owner" }), bob],
      onMembersChange,
    });

    const list = screen.getByTestId("owner-manage-members-list");
    const removeBtn = within(list).getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    expect(circlesClient.removeCircleMember).toHaveBeenCalledWith("circle-1", "m-bob");
    expect(onMembersChange).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ membershipId: "m-bob" })]),
    );
  });

  it("shows inline edit for external ID when Edit button clicked", async () => {
    const user = userEvent.setup();
    const member = makeMember({ externalId: "old-ext-id" });
    renderPanel({ members: [member] });

    await user.click(screen.getByRole("button", { name: /edit external id/i }));
    const list = screen.getByTestId("owner-manage-members-list");
    const input = within(list).getByRole("textbox", { name: /edit external id/i });
    expect(input).toHaveValue("old-ext-id");
  });

  it("calls updateCircleMember and invokes onMembersChange with the updated member on Save", async () => {
    const user = userEvent.setup();
    const member = makeMember({ membershipId: "mem-1", externalId: "old-ext-id" });
    const updated = makeMember({ membershipId: "mem-1", externalId: "new-ext-id" });
    vi.mocked(circlesClient.updateCircleMember).mockResolvedValueOnce(updated);
    const onMembersChange = vi.fn();
    renderPanel({ members: [member], onMembersChange });

    await user.click(screen.getByRole("button", { name: /edit external id/i }));
    const list = screen.getByTestId("owner-manage-members-list");
    const input = within(list).getByRole("textbox", { name: /edit external id/i });
    await user.clear(input);
    await user.type(input, "new-ext-id");
    await user.click(within(list).getByRole("button", { name: /save/i }));

    expect(circlesClient.updateCircleMember).toHaveBeenCalledWith("circle-1", "mem-1", {
      externalId: "new-ext-id",
    });
    expect(onMembersChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ membershipId: "mem-1", externalId: "new-ext-id" })]),
    );
  });
});

describe("CircleOwnerPanel — circle tokens", () => {
  it("renders the Mint new token button", () => {
    renderPanel({});
    expect(screen.getByTestId("mint-token-button")).toBeInTheDocument();
  });

  it("shows the mint form when Mint new token is clicked", async () => {
    const user = userEvent.setup();
    renderPanel({});

    await user.click(screen.getByTestId("mint-token-button"));
    expect(screen.getByTestId("mint-token-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mint token/i })).toBeInTheDocument();
  });

  it("calls mintCircleToken and shows the fresh token block after success", async () => {
    const user = userEvent.setup();
    renderPanel({});

    await user.click(screen.getByTestId("mint-token-button"));
    await user.click(screen.getByRole("button", { name: /mint token/i }));

    expect(circlesClient.mintCircleToken).toHaveBeenCalledWith("circle-1", { label: undefined });
    expect(await screen.findByTestId("fresh-token-block")).toBeInTheDocument();
    expect(screen.getByText(/token created/i)).toBeInTheDocument();
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
  });

  it("reveals and hides the fresh token value", async () => {
    const user = userEvent.setup();
    renderPanel({});

    await user.click(screen.getByTestId("mint-token-button"));
    await user.click(screen.getByRole("button", { name: /mint token/i }));

    const block = await screen.findByTestId("fresh-token-block");
    const tokenInput = within(block).getByRole("textbox");
    expect(tokenInput).not.toHaveValue("haaabit_circle_abc123");

    await user.click(within(block).getByRole("button", { name: /reveal/i }));
    expect(tokenInput).toHaveValue("haaabit_circle_abc123");

    await user.click(within(block).getByRole("button", { name: /hide/i }));
    expect(tokenInput).not.toHaveValue("haaabit_circle_abc123");
  });

  it("shows existing tokens loaded from the API", async () => {
    vi.mocked(circlesClient.listCircleTokens).mockResolvedValueOnce([makeToken()]);
    renderPanel({});

    const tokenList = await screen.findByTestId("token-list");
    expect(within(tokenList).getByText("Test bot")).toBeInTheDocument();
  });

  it("calls revokeCircleToken and removes token from list after confirmation", async () => {
    vi.mocked(circlesClient.listCircleTokens).mockResolvedValueOnce([makeToken({ tokenId: "tok-1", label: "My bot" })]);
    const user = userEvent.setup();
    renderPanel({});

    const tokenList = await screen.findByTestId("token-list");
    await user.click(within(tokenList).getByRole("button", { name: /revoke/i }));

    expect(circlesClient.revokeCircleToken).toHaveBeenCalledWith("circle-1", "tok-1");
    expect(screen.queryByText("My bot")).not.toBeInTheDocument();
  });

  it("shows no-tokens message when token list is empty", async () => {
    vi.mocked(circlesClient.listCircleTokens).mockResolvedValueOnce([]);
    renderPanel({});
    expect(await screen.findByText(/no tokens issued yet/i)).toBeInTheDocument();
  });
});
