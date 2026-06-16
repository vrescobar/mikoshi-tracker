import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tabs, type TabItem } from "../tabs";

const ITEMS: TabItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

function Harness() {
  const [active, setActive] = useState("a");
  return <Tabs items={ITEMS} active={active} onChange={setActive} ariaLabel="Sections" />;
}

describe("Tabs", () => {
  it("marks the active tab selected and switches on click", () => {
    render(<Harness />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(alpha).toHaveAttribute("aria-selected", "true");

    fireEvent.click(beta);
    expect(beta).toHaveAttribute("aria-selected", "true");
    expect(alpha).toHaveAttribute("aria-selected", "false");
  });

  it("moves selection with arrow keys (roving tabindex)", () => {
    render(<Harness />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");

    // Wraps from the first tab to the last on ArrowLeft.
    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Alpha" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  });
});
