import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageActionsMenu } from "../../../src/webview/components/PageActionsMenu";

describe("PageActionsMenu", () => {
  test("shows Remove only when onRemove is provided", async () => {
    const onRemove = mock(async () => {});

    render(
      <PageActionsMenu
        recordTitle="Row page"
        trigger="vertical-dots"
        menuPlacement="inline"
        onArchive={async () => {}}
        onRemove={onRemove}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("shows Move only when onMove is provided", () => {
    const onMove = mock(() => {});

    render(
      <PageActionsMenu
        recordTitle="Row page"
        trigger="vertical-dots"
        menuPlacement="inline"
        onArchive={async () => {}}
        onRemove={async () => {}}
        onMove={onMove}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));

    expect(onMove).toHaveBeenCalledTimes(1);
  });

  test("omits Remove from the page app bar menu", () => {
    render(
      <PageActionsMenu
        recordTitle="Current page"
        onRelate={() => {}}
        onArchive={async () => {}}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    expect(screen.getByRole("menuitem", { name: "Relate" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Remove" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  test("omits Archive when page is already archived", () => {
    render(
      <PageActionsMenu
        recordTitle="Archived page"
        archived
        onArchive={async () => {}}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
  });

  test("shows Unarchive when page is archived and onUnarchive is provided", () => {
    render(
      <PageActionsMenu
        recordTitle="Archived page"
        archived
        onArchive={async () => {}}
        onUnarchive={async () => {}}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeTruthy();
  });

  test("archive confirm uses archive hub title", async () => {
    render(
      <PageActionsMenu
        recordTitle="Draft page"
        archiveHubTitle="Archive hub"
        onArchive={async () => {}}
        onDelete={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    expect(
      screen.getByText(
        'Archive “Draft page”? It will be moved under Archive hub and hidden from most views.',
      ),
    ).toBeTruthy();
  });
});
