import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          nodeId: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
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

  test("filters rows by name from search input", async () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const getDatabaseView = mock(async (_id: string, _tab?: string, query?: { q?: string }) => {
      expect(query?.q).toBe("quest");
      return makeDatabaseViewDetail({
        rows: [
          {
            rowIndex: 0,
            nodeId: FIXTURE_TARGET_ID,
            name: "Quest item",
            cells: { priority: "High" },
          },
        ],
      });
    });
    const api = { ...makeMockEditorApi(), getDatabaseView };
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
                nodeId: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
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

    await waitFor(() => expect(getDatabaseView).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Quest item" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Other item" })).toBeNull();
    expect(window.location.search).toContain("search_items=quest");
  });

  test("seeds search filter from URL on load", async () => {
    window.history.replaceState(
      {},
      "",
      "http://127.0.0.1:5173/?node=abc&search_items=linked",
    );
    const getDatabaseView = mock(async (_id: string, _tab?: string, query?: { q?: string }) => {
      expect(query?.q).toBe("linked");
      return makeDatabaseViewDetail({
        rows: [
          {
            rowIndex: 0,
            nodeId: FIXTURE_TARGET_ID,
            name: "Linked record",
            cells: { priority: "High" },
          },
        ],
      });
    });
    const api = { ...makeMockEditorApi(), getDatabaseView };
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
                nodeId: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
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
    await waitFor(() => expect(getDatabaseView).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Other record" })).toBeNull();
  });

  test("omits hidden columns from the table and toggles visibility via toolbar", async () => {
    const api = makeMockEditorApi();
    let updateInput: { properties?: string[] } | undefined;
    api.updateRelationshipView = async (nodeId, association, viewId, input) => {
      void nodeId;
      void association;
      void viewId;
      updateInput = input;
      return {
        id: "all",
        nodeId: FIXTURE_DATABASE_ID,
        association: "members",
        name: "All",
        sorts: [{ column: "name", direction: "asc" }],
        properties: input.properties,
      };
    };

    const databaseView = makeDatabaseViewDetail({
      allColumns: ["status", "priority"],
      columns: ["status"],
      columnDefs: [{ key: "status", name: "Status", type: "text" }],
      allColumnDefs: [
        { key: "status", name: "Status", type: "text" },
        { key: "priority", name: "Priority", type: "enum", enumId: "priority" },
      ],
      tabs: {
        kind: "custom",
        items: [{ id: "all", label: "All", kind: "custom" }],
        activeTabId: "all",
        customDefinitions: [
          {
            id: "all",
            name: "All",
            sorts: [{ column: "name", direction: "asc" }],
            properties: ["status"],
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
          onTabsUpdated={() => {}}
        />
      </UserSettingsProvider>,
    );

    expect(
      screen
        .getAllByRole("button", { name: "Status" })
        .some((el) => el.classList.contains("tome-table-sort-button")),
    ).toBe(true);
    expect(
      screen
        .queryAllByRole("button", { name: "Priority" })
        .some((el) => el.classList.contains("tome-table-sort-button")),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Column visibility" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show Priority" }));
    expect(updateInput?.properties).toEqual(["status", "priority"]);
  });

  test("unlinks rows with memberSidePerspective from the view payload", async () => {
    const unlinkOutgoingRelationship = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      unlinkOutgoingRelationship,
    };
    const databaseView = makeDatabaseViewDetail({
      viewAssociation: "cohort",
      memberSidePerspective: "belongs_to_cohort",
    });

    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={databaseView}
          onTabSelect={() => {}}
          onTabsUpdated={() => {}}
          onArchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() =>
      expect(unlinkOutgoingRelationship).toHaveBeenCalledWith(
        FIXTURE_TARGET_ID,
        "belongs_to_cohort",
        FIXTURE_DATABASE_ID,
      ),
    );
  });

  test("creates tabs with viewAssociation from the view payload", async () => {
    const createRelationshipView = mock(
      async (_nodeId: string, association: string, input: { name: string }) => ({
        id: "new-tab",
        nodeId: FIXTURE_DATABASE_ID,
        association,
        name: input.name,
        sorts: [{ column: "name", direction: "asc" as const }],
      }),
    );
    const api = {
      ...makeMockEditorApi(),
      createRelationshipView,
    };
    const databaseView = makeDatabaseViewDetail({
      viewAssociation: "cohort",
      memberSidePerspective: "belongs_to_cohort",
    });
    let selectedTab = "";

    render(
      <UserSettingsProvider api={api}>
        <DatabaseTableView
          api={api}
          nodeId={FIXTURE_DATABASE_ID}
          databaseView={databaseView}
          onTabSelect={(tabId) => {
            selectedTab = tabId;
          }}
          onTabsUpdated={() => {}}
        />
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
    fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: "Custom cohort" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createRelationshipView).toHaveBeenCalledTimes(1));
    expect(createRelationshipView.mock.calls[0]?.[0]).toBe(FIXTURE_DATABASE_ID);
    expect(createRelationshipView.mock.calls[0]?.[1]).toBe("cohort");
    expect(createRelationshipView.mock.calls[0]?.[2]).toMatchObject({ name: "Custom cohort" });
    expect(selectedTab).toBe("new-tab");
  });
});
