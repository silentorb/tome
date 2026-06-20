import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TableSearchInput } from "../../../src/webview/components/TableSearchInput";
import { TableUtilityBar } from "../../../src/webview/components/TableUtilityBar";

describe("TableUtilityBar", () => {
  test("renders custom tabs with add control", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [
            { id: "all", label: "All", kind: "custom" },
            { id: "active", label: "Active", kind: "custom" },
          ],
          activeTabId: "all",
          customDefinitions: [
            { id: "all", name: "All", sorts: [] },
            { id: "active", name: "Active", sorts: [] },
          ],
        }}
        onTabSelect={() => {}}
        onCreateTab={async () => {}}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tab actions for/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add tab" })).toBeTruthy();
  });

  test("opens tab editor on right click", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [{ id: "all", label: "All", kind: "custom" }],
          activeTabId: "all",
          customDefinitions: [{ id: "all", name: "All", sorts: [] }],
        }}
        onTabSelect={() => {}}
        onCreateTab={async () => {}}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByLabelText("Tab name")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByText("Sort order")).toBeTruthy();
  });

  test("opens tab editor when clicking the active tab", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [
            { id: "all", label: "All", kind: "custom" },
            { id: "active", label: "Active", kind: "custom" },
          ],
          activeTabId: "all",
          customDefinitions: [
            { id: "all", name: "All", sorts: [] },
            { id: "active", name: "Active", sorts: [] },
          ],
        }}
        onTabSelect={() => {}}
        onCreateTab={async () => {}}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByLabelText("Tab name")).toBeTruthy();
  });

  test("shows draft tab and defers create until save", async () => {
    const onCreateTab = mock(async () => {});

    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [{ id: "all", label: "All", kind: "custom" }],
          activeTabId: "all",
          customDefinitions: [{ id: "all", name: "All", sorts: [] }],
        }}
        onTabSelect={() => {}}
        onCreateTab={onCreateTab}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
    expect(screen.getByRole("tab", { name: "New tab" })).toBeTruthy();
    expect(screen.getByLabelText("Tab name")).toBeTruthy();
    expect(onCreateTab).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: "Backlog" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onCreateTab).toHaveBeenCalledTimes(1));
    expect(onCreateTab).toHaveBeenCalledWith({
      name: "Backlog",
      sorts: [{ column: "name", direction: "asc" }],
    });
  });

  test("discards draft tab on cancel", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [{ id: "all", label: "All", kind: "custom" }],
          activeTabId: "all",
          customDefinitions: [{ id: "all", name: "All", sorts: [] }],
        }}
        onTabSelect={() => {}}
        onCreateTab={async () => {}}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
    expect(screen.getByRole("tab", { name: "New tab" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("tab", { name: "New tab" })).toBeNull();
  });

  test("marks custom tabs reorderable when onTabsReorder is provided", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "custom",
          items: [
            { id: "all", label: "All", kind: "custom" },
            { id: "active", label: "Active", kind: "custom" },
          ],
          activeTabId: "all",
          customDefinitions: [
            { id: "all", name: "All", sorts: [] },
            { id: "active", name: "Active", sorts: [] },
          ],
        }}
        onTabSelect={() => {}}
        onCreateTab={async () => {}}
        onUpdateTab={async () => {}}
        onDeleteTab={async () => {}}
        onTabsReorder={async () => {}}
      />,
    );

    expect(document.querySelectorAll(".tome-database-view-tab.is-reorderable")).toHaveLength(2);
  });

  test("hides generated tab chrome", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "generated",
          items: [
            { id: "book-a", label: "Book A", kind: "generated" },
            { id: "book-b", label: "Book B", kind: "generated" },
          ],
          activeTabId: "book-a",
        }}
        onTabSelect={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "Book A" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add tab" })).toBeNull();
  });

  test("renders search-only utility bar without tabs", () => {
    render(
      <TableUtilityBar
        search={<TableSearchInput value="" onChange={() => {}} />}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Filter table rows by name" })).toBeTruthy();
    expect(document.querySelector(".tome-table-search-icon")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(document.querySelector(".tome-table-utility-actions")).toBeTruthy();
  });

  test("renders add row control to the right of search", () => {
    render(
      <TableUtilityBar
        search={<TableSearchInput value="" onChange={() => {}} />}
        addRow={<button type="button">New</button>}
      />,
    );

    const actions = document.querySelector(".tome-table-utility-actions");
    expect(actions).toBeTruthy();
    const search = actions!.querySelector(".tome-table-search");
    const addRow = screen.getByRole("button", { name: "New" });
    expect(search).toBeTruthy();
    expect(addRow).toBeTruthy();
    expect((search!.compareDocumentPosition(addRow) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
  });

  test("renders search to the right of tabs", () => {
    render(
      <TableUtilityBar
        tabs={{
          kind: "generated",
          items: [
            { id: "book-a", label: "Book A", kind: "generated" },
            { id: "book-b", label: "Book B", kind: "generated" },
          ],
          activeTabId: "book-a",
        }}
        onTabSelect={() => {}}
        search={<TableSearchInput value="quest" onChange={() => {}} />}
      />,
    );

    const row = document.querySelector(".tome-table-utility-row");
    expect(row).toBeTruthy();
    const tabs = row!.querySelector(".tome-table-utility-tabs");
    const actions = row!.querySelector(".tome-table-utility-actions");
    expect(tabs).toBeTruthy();
    expect(actions).toBeTruthy();
    expect((tabs!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
  });
});
