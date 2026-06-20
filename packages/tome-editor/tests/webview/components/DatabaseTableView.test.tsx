import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { DatabaseTableView } from "../../../src/webview/components/DatabaseTableView";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import {
  makeDatabaseViewDetail,
  FIXTURE_DATABASE_ID,
  FIXTURE_TARGET_ID,
} from "../test-fixtures/node-page";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

describe("DatabaseTableView", () => {
  test("renders database rows and column headers", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={makeDatabaseViewDetail()}
          onTabSelect={() => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByRole("button", { name: "Name" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("button", { name: "Priority" })
        .some((el) => el.classList.contains("tome-table-sort-button")),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
  });

  test("sorts rows using the active tab sort config", () => {
    const api = makeMockEditorApi();
    const databaseView = makeDatabaseViewDetail({
      rows: [
        {
          rowIndex: 0,
          nodeId: FIXTURE_TARGET_ID,
          name: "Beta",
          cells: { priority: "High" },
        },
        {
          rowIndex: 1,
          nodeId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          name: "Alpha",
          cells: { priority: "Low" },
        },
      ],
      tabs: {
        kind: "custom",
        items: [{ id: "prio", label: "By priority", kind: "custom" }],
        activeTabId: "prio",
        customDefinitions: [
          {
            id: "prio",
            name: "By priority",
            sorts: [{ column: "priority", direction: "desc" }],
          },
        ],
      },
    });

    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={databaseView}
          onTabSelect={() => {}}
        />
      </UserSettingsProvider>,
    );

    const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Beta");
    expect(names[1]).toContain("Alpha");
    const sortButtons = screen
      .getAllByRole("button", { name: "Priority" })
      .filter((button) => button.classList.contains("tome-table-sort-button"));
    expect(sortButtons[0]?.getAttribute("aria-sort")).toBe("descending");
  });

  test("shows view tabs and calls onTabSelect", () => {
    const api = makeMockEditorApi();
    let selectedTab = "all";
    const databaseView = makeDatabaseViewDetail({
      views: ["All", "Active"],
      view: "All",
      tabs: {
        kind: "custom",
        items: [
          { id: "all", label: "All", kind: "custom" },
          { id: "active", label: "Active", kind: "custom" },
        ],
        activeTabId: "all",
        customDefinitions: [
          { id: "all", name: "All", sorts: [{ column: "name", direction: "asc" }] },
          { id: "active", name: "Active", sorts: [{ column: "name", direction: "asc" }] },
        ],
      },
    });

    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={databaseView}
          onTabSelect={(tabId) => {
            selectedTab = tabId;
          }}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Active" }));
    expect(selectedTab).toBe("active");
  });

  test("shows empty state when there are no rows", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={makeDatabaseViewDetail({ rows: [], columns: [] })}
          onTabSelect={() => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByText("No rows in this view.")).toBeTruthy();
  });

  test("filters rows by name from search input", () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={makeDatabaseViewDetail({
            rows: [
              {
                rowIndex: 0,
                nodeId: FIXTURE_TARGET_ID,
                name: "Quest item",
                cells: { priority: "High" },
              },
              {
                rowIndex: 1,
                nodeId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                name: "Other item",
                cells: { priority: "Low" },
              },
            ],
          })}
          onTabSelect={() => {}}
        />
      </UserSettingsProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table rows by name" }), {
      target: { value: "quest" },
    });

    expect(screen.getByRole("link", { name: "Quest item" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Other item" })).toBeNull();
    expect(window.location.search).toContain("search_items=quest");
  });

  test("seeds search filter from URL on load", () => {
    window.history.replaceState(
      {},
      "",
      "http://127.0.0.1:5173/?node=abc&search_items=linked",
    );
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={makeDatabaseViewDetail({
            rows: [
              {
                rowIndex: 0,
                nodeId: FIXTURE_TARGET_ID,
                name: "Linked record",
                cells: { priority: "High" },
              },
              {
                rowIndex: 1,
                nodeId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                name: "Other record",
                cells: { priority: "Low" },
              },
            ],
          })}
          onTabSelect={() => {}}
        />
      </UserSettingsProvider>,
    );

    expect(
      (screen.getByRole("searchbox", { name: "Filter table rows by name" }) as HTMLInputElement).value,
    ).toBe("linked");
    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Other record" })).toBeNull();
  });
});
