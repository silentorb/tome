import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupedDatabaseView } from "../../../src/webview/components/GroupedDatabaseView";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { DatabaseViewDetail } from "../../../src/shared/types";

const TYPE_DB = "0000000000000000000000000D";
const SCENE_ID = "scene111111111111111111111111111";
const BOOK_A = "bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const view: DatabaseViewDetail = {
  id: TYPE_DB,
  title: "Scenes",
  view: "TWOLD",
  views: ["TWOLD", "Fairytale"],
  viewAssociation: "000000000000000000000000A2",
  memberSidePerspective: "000000000000000000000000A2:1",
  sectionTitle: "Contents",
  tabs: {
    kind: "generated",
    items: [
      { id: BOOK_A, label: "TWOLD", kind: "generated" },
      { id: "bookbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", label: "Fairytale", kind: "generated" },
    ],
    activeTabId: BOOK_A,
  },
  groups: [
    {
      groupId: "part1111111111111111111111111111",
      title: "Part 1",
      rows: [
        {
          rowIndex: 0,
          nodeId: SCENE_ID,
          name: "Opening",
          cells: { characters: "Hero" },
          relationCells: {
            characters: [{ targetId: "char1111111111111111111111111111", title: "Hero" }],
          },
        },
      ],
    },
    {
      groupId: "__unassigned__",
      title: "Unassigned",
      rows: [],
    },
  ],
  rows: [
    {
      rowIndex: 0,
      nodeId: SCENE_ID,
      name: "Opening",
      cells: { characters: "Hero" },
    },
  ],
  rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
  allColumns: ["solutions", "characters", "location"],
  columns: ["solutions", "characters", "location"],
  columnDefs: [
    { key: "solutions", name: "Solutions", type: "relation", relationType: "solutions" },
    { key: "characters", name: "📁 Characters", type: "relation", relationType: "characters" },
    { key: "location", name: "📁 Location", type: "relation", relationType: "location" },
  ],
  presentation: {
    compositionId: "scenes-by-book",
    scopeId: BOOK_A,
    scopeRelationType: "product:0",
    groupRelationType: "part:0",
    groupCompositeType: "part",
    reorderable: true,
  },
};

describe("GroupedDatabaseView", () => {
  test("renders scope tabs, group headings, and schema-driven column headers", () => {
    const api = makeMockEditorApi();

    const { getByRole, getAllByText, queryByRole } = render(
      <GroupedDatabaseView
        api={api}
        nodeId={BOOK_A}
        view={view}
        onTabSelect={() => {}}
        onViewChange={() => {}}
      />,
    );

    expect(getByRole("tab", { name: "TWOLD" })).toBeTruthy();
    expect(getByRole("tab", { name: "Fairytale" })).toBeTruthy();
    expect(getByRole("heading", { name: "Part 1", level: 3 })).toBeTruthy();
    expect(getByRole("link", { name: "Opening" })).toBeTruthy();
    expect(getAllByText("Solutions").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("📁 Characters").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("📁 Location").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll("th.tome-column-header.is-reorderable").length).toBe(6);
    expect(queryByRole("columnheader", { name: "Status" })).toBeNull();
  });

  test("filters grouped rows via the server window query", async () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const getDatabaseView = mock(
      async (_databaseId: string, _tabId?: string, query?: { q?: string }) => {
        expect(query?.q).toBe("opening");
        return {
          ...view,
          groups: [view.groups![0]!],
          rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
        };
      },
    );
    const api = {
      ...makeMockEditorApi(),
      getDatabaseView,
    };

    const { getByRole, queryByRole } = render(
      <GroupedDatabaseView
        api={api}
        nodeId={BOOK_A}
        view={view}
        onTabSelect={() => {}}
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(getByRole("searchbox", { name: "Filter table rows by name" }), {
      target: { value: "opening" },
    });

    await waitFor(() => expect(getDatabaseView).toHaveBeenCalled());
    expect(getByRole("link", { name: "Opening" })).toBeTruthy();
    expect(queryByRole("heading", { name: "Unassigned", level: 3 })).toBeNull();
    expect(window.location.search).toContain("search_items=opening");
  });

  test("shows an empty match message when no rows match", async () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc&search_items=missing");
    const getDatabaseView = mock(async () => ({
      ...view,
      groups: [],
      rows: [],
      rowsWindow: { offset: 0, limit: 50, total: 0, hasMore: false },
    }));
    const api = {
      ...makeMockEditorApi(),
      getDatabaseView,
    };

    const { getByText } = render(
      <GroupedDatabaseView
        api={api}
        nodeId={BOOK_A}
        view={view}
        onTabSelect={() => {}}
        onViewChange={() => {}}
      />,
    );

    await waitFor(() => expect(getByText('No rows match “missing”.')).toBeTruthy());
  });

  test("creates a row in a group with scope and group relations", async () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const createDatabaseRow = mock(async () => ({
      id: "FFFFFFFFFFFFFFFFFFFFFFFFFF",
      title: "New Scene",
    }));
    const getDatabaseView = mock(async () => view);
    const onViewChange = mock(() => {});
    const api = {
      ...makeMockEditorApi(),
      createDatabaseRow,
      getDatabaseView,
    };

    render(
      <GroupedDatabaseView
        api={api}
        nodeId={BOOK_A}
        view={view}
        onTabSelect={() => {}}
        onViewChange={onViewChange}
      />,
    );

    const triggers = screen.getAllByRole("button", { name: "+ New row" });
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(triggers[0]!);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New Scene" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(createDatabaseRow).toHaveBeenCalledWith(TYPE_DB, {
        title: "New Scene",
        view: "TWOLD",
        relations: [
          { type: "product:0", targetId: BOOK_A },
          { type: "part:0", targetId: "part1111111111111111111111111111" },
        ],
        orderScopeRelations: [{ type: "product:0", targetId: BOOK_A }],
      }),
    );
    await waitFor(() => expect(onViewChange).toHaveBeenCalled());
  });

  test("unlinks rows with memberSidePerspective from the view payload", async () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const unlinkOutgoingRelationship = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      unlinkOutgoingRelationship,
    };
    const customView: DatabaseViewDetail = {
      ...view,
      viewAssociation: "000000000000000000000000B6",
      memberSidePerspective: "000000000000000000000000B6:1",
    };

    render(
      <GroupedDatabaseView
        api={api}
        nodeId={BOOK_A}
        view={customView}
        onTabSelect={() => {}}
        onViewChange={() => {}}
        onArchiveNode={async () => {}}
        onDeleteNode={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() =>
      expect(unlinkOutgoingRelationship).toHaveBeenCalledWith(
        SCENE_ID,
        "000000000000000000000000B6:1",
        TYPE_DB,
      ),
    );
  });
});
