import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { HabitAttachmentsGallery } from "../habit-attachments-gallery";

vi.mock("../../../lib/auth-client", () => ({
  listHabitAttachments: vi.fn(),
  uploadHabitAttachments: vi.fn(),
  deleteAttachment: vi.fn(),
  attachmentFileUrl: (id: string) => `/api/attachments/${id}/file`,
}));

import * as authClient from "../../../lib/auth-client";

const mockList = vi.mocked(authClient.listHabitAttachments);
const mockUpload = vi.mocked(authClient.uploadHabitAttachments);
const mockDelete = vi.mocked(authClient.deleteAttachment);

function attachment(id: string) {
  return {
    id,
    mutationId: "mut-1",
    kind: "image" as const,
    mimeType: "image/jpeg",
    size: 1000,
    width: 800,
    height: 600,
    originalName: `${id}.jpg`,
    createdAt: "2026-05-19T10:00:00.000Z",
    url: `/api/attachments/${id}/file`,
  };
}

function renderGallery() {
  return render(
    <LocaleProvider initialLocale="en">
      <HabitAttachmentsGallery habitId="habit-1" />
    </LocaleProvider>,
  );
}

describe("HabitAttachmentsGallery", () => {
  it("shows the empty copy when the habit has no attachments", async () => {
    mockList.mockResolvedValue({ attachments: [], limit: 10, remaining: 10 });
    renderGallery();

    expect(await screen.findByText("No photos attached yet.")).toBeTruthy();
  });

  it("renders attachment thumbnails and deletes one", async () => {
    mockList
      .mockResolvedValueOnce({ attachments: [attachment("att-1")], limit: 10, remaining: 9 })
      .mockResolvedValueOnce({ attachments: [], limit: 10, remaining: 10 });
    mockDelete.mockResolvedValue(undefined);
    renderGallery();

    const tiles = await screen.findAllByTestId("habit-attachment-tile");
    expect(tiles).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("att-1");
    });
    expect(await screen.findByText("No photos attached yet.")).toBeTruthy();
  });

  it("surfaces an error notice when listing fails", async () => {
    mockList.mockRejectedValue(new Error("network down"));
    renderGallery();

    expect(await screen.findByText("network down")).toBeTruthy();
  });

  it("falls back to a placeholder when a thumbnail file is unavailable", async () => {
    mockList.mockResolvedValue({ attachments: [attachment("att-1")], limit: 10, remaining: 9 });
    renderGallery();

    const image = await screen.findByRole("img");
    image.dispatchEvent(new Event("error"));

    expect(await screen.findByText("Photo unavailable")).toBeTruthy();
  });

  it("uploads selected files and refreshes the list", async () => {
    mockList
      .mockResolvedValueOnce({ attachments: [], limit: 10, remaining: 10 })
      .mockResolvedValueOnce({ attachments: [attachment("att-new")], limit: 10, remaining: 9 });
    mockUpload.mockResolvedValue({ attachments: [attachment("att-new")], limit: 10, remaining: 9 });
    renderGallery();

    await screen.findByText("No photos attached yet.");
    const input = screen.getByTestId("habit-attachment-input");
    const file = new File(["x"], "meal.png", { type: "image/png" });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith("habit-1", [file]);
    });
    expect(await screen.findAllByTestId("habit-attachment-tile")).toHaveLength(1);
  });
});
