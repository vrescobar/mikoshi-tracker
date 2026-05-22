import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../../lib/i18n/food", () => ({
  getFoodCopy: () => ({
    dialog: {
      title: "Add food",
      description: "Add a food entry manually.",
      submitLabel: "Add",
      submittingLabel: "Adding…",
      cancelLabel: "Cancel",
      errorTitle: "Could not add food",
    },
    detail: {
      fields: {
        name: "Name",
        kcal: "Calories",
        protein_g: "Protein",
        carbs_g: "Carbs",
        fat_g: "Fat",
        fiber_g: "Fiber",
        mealSlot: "Meal",
        notes: "Notes",
      },
      edit: {
        editLabel: "Edit",
        saveLabel: "Save",
        cancelLabel: "Cancel",
        saving: "Saving…",
        errorTitle: "Unable to save",
        validationKcal: "Calories must be 0 or higher.",
        validationName: "Name is required.",
        validationMacro: "Macro values must be 0 or higher.",
      },
      mealSlots: {
        none: "None",
        breakfast: "Breakfast",
        lunch: "Lunch",
        snack: "Snack",
        dinner: "Dinner",
        other: "Other",
      },
    },
  }),
}));
vi.mock("../../../lib/food-client", () => ({
  createFoodEvent: vi.fn(),
  ensureFoodEntry: vi.fn(),
}));
vi.mock("../../ui", () => ({
  Button: ({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
  Field: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Notice: ({ children, title }: { children?: ReactNode; title?: string }) => (
    <div role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
  OverlayPanel: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
  Select: ({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...rest}>{children}</select>,
}));

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import type { EntryEventDetail } from "@mikoshi-tracker/contracts/events";
import { createFoodEvent, ensureFoodEntry } from "../../../lib/food-client";
import { ProposalDialog } from "../ProposalDialog";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockEntry = { id: "entry-1" };
const mockEvent = { id: "event-1" } as unknown as EntryEventDetail;

function renderDialog() {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(<ProposalDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);
  return { onOpenChange, onCreated };
}

describe("ProposalDialog — validation", () => {
  it("shows a Notice and does not call createFoodEvent when name is empty", () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(createFoodEvent).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows a Notice and does not call createFoodEvent when kcal is empty", () => {
    renderDialog();

    // Name is filled but kcal is left empty → parseFloat("") = NaN → validationKcal
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Apple" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Calories must be 0 or higher.")).toBeInTheDocument();
    expect(createFoodEvent).not.toHaveBeenCalled();
  });
});

describe("ProposalDialog — error handling", () => {
  it("shows a Notice with the error message and keeps dialog open when ensureFoodEntry rejects", async () => {
    vi.mocked(ensureFoodEntry).mockRejectedValue(new Error("Server unavailable"));

    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Apple" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "100" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "0" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[2], { target: { value: "25" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[3], { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Server unavailable")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("ProposalDialog — valid submit", () => {
  it("calls ensureFoodEntry then createFoodEvent with source=manual confidence=1.0, empty mealSlot/fiber_g as null, then calls onCreated and closes", async () => {
    vi.mocked(ensureFoodEntry).mockResolvedValue(mockEntry as unknown as EntryRecord);
    vi.mocked(createFoodEvent).mockResolvedValue(mockEvent);

    const { onOpenChange, onCreated } = renderDialog();

    // Fill required fields; leave mealSlot (select default "") and fiber_g empty
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Apple" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "100" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "0" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[2], { target: { value: "25" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[3], { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createFoodEvent).toHaveBeenCalledOnce());

    expect(ensureFoodEntry).toHaveBeenCalledOnce();
    expect(createFoodEvent).toHaveBeenCalledWith(
      "entry-1",
      expect.objectContaining({
        name: "Apple",
        kcal: 100,
        protein_g: 0,
        carbs_g: 25,
        fat_g: 0,
        fiber_g: null,
        mealSlot: null,
        source: "manual",
        confidence: 1.0,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(mockEvent);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
