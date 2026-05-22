import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: vi.fn(),
}));

describe("habits pages — redirect to entries", () => {
  it("list page redirects to /entries?entryTypeSlug=habit_boolean,habit_quantity", async () => {
    const { default: Page } = await import("../page");
    Page();
    expect(mockRedirect).toHaveBeenCalledWith("/entries?entryTypeSlug=habit_boolean,habit_quantity");
  });

  it("new habit page redirects to /entries?entryTypeSlug=habit_boolean,habit_quantity", async () => {
    const { default: Page } = await import("../new/page");
    Page();
    expect(mockRedirect).toHaveBeenCalledWith("/entries?entryTypeSlug=habit_boolean,habit_quantity");
  });

  it("habit detail page redirects to /entries?entryTypeSlug=habit_boolean,habit_quantity", async () => {
    const { default: Page } = await import("../[habitId]/page");
    Page();
    expect(mockRedirect).toHaveBeenCalledWith("/entries?entryTypeSlug=habit_boolean,habit_quantity");
  });
});
