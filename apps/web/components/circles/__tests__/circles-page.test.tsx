import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { CirclesPage } from "../circles-page";

vi.mock("../../../lib/circles-client", () => ({
  createCircle: vi.fn(),
  listCircles: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import * as circlesClient from "../../../lib/circles-client";

const mockCreateCircle = vi.mocked(circlesClient.createCircle);
const mockListCircles = vi.mocked(circlesClient.listCircles);

function makeCircle(overrides: { id?: string; name?: string; ownerId?: string } = {}) {
  return {
    id: overrides.id ?? "circle-1",
    name: overrides.name ?? "Morning Routines",
    ownerId: overrides.ownerId ?? "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(props: { initialItems?: ReturnType<typeof makeCircle>[]; currentUserId?: string } = {}) {
  return render(
    <LocaleProvider initialLocale="en">
      <CirclesPage initialItems={props.initialItems ?? []} currentUserId={props.currentUserId ?? "user-1"} />
    </LocaleProvider>,
  );
}

describe("CirclesPage — render", () => {
  it("shows StatePanel when initialItems is empty", () => {
    renderPage({ initialItems: [] });
    expect(screen.getByText("No circles yet")).toBeInTheDocument();
  });

  it("renders one card per circle", () => {
    const circles = [makeCircle({ id: "c1", name: "Alpha" }), makeCircle({ id: "c2", name: "Beta" })];
    renderPage({ initialItems: circles, currentUserId: "user-1" });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows Owner badge only for circles the current user owns", () => {
    const circles = [
      makeCircle({ id: "c1", name: "Mine", ownerId: "user-1" }),
      makeCircle({ id: "c2", name: "Theirs", ownerId: "user-2" }),
    ];
    renderPage({ initialItems: circles, currentUserId: "user-1" });

    const badges = screen.getAllByText(/Owner|Member/);
    expect(badges.find((b) => b.textContent === "Owner")?.closest("article")).toHaveTextContent("Mine");
    expect(badges.find((b) => b.textContent === "Member")?.closest("article")).toHaveTextContent("Theirs");
  });
});

describe("CirclesPage — create flow", () => {
  it("shows nameRequired notice and does not call createCircle when name is blank", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new circle/i }));
    await user.click(screen.getByRole("button", { name: /create circle/i }));

    expect(screen.getByText("Add a name for this circle.")).toBeInTheDocument();
    expect(mockCreateCircle).not.toHaveBeenCalled();
  });

  it("surfaces a visible error inside the dialog when createCircle rejects", async () => {
    mockCreateCircle.mockRejectedValueOnce(new Error("Server error"));
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new circle/i }));
    await user.type(screen.getByRole("textbox"), "My Circle");
    await user.click(screen.getByRole("button", { name: /create circle/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clears the pending feedback banner after createCircle rejects", async () => {
    mockCreateCircle.mockRejectedValueOnce(new Error("Server error"));
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new circle/i }));
    await user.type(screen.getByRole("textbox"), "My Circle");
    await user.click(screen.getByRole("button", { name: /create circle/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    expect(screen.queryByText("Creating circle")).not.toBeInTheDocument();
  });

  it("closes the dialog and renders the new card after a successful create", async () => {
    const newCircle = makeCircle({ id: "c-new", name: "New Circle", ownerId: "user-1" });
    mockCreateCircle.mockResolvedValueOnce(newCircle);
    mockListCircles.mockResolvedValueOnce([newCircle]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new circle/i }));
    await user.type(screen.getByRole("textbox"), "New Circle");
    await user.click(screen.getByRole("button", { name: /create circle/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("New Circle")).toBeInTheDocument();
    expect(screen.getByText("Circle created")).toBeInTheDocument();
  });
});
