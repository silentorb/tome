import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrderedCollectionView } from "../../../src/webview/components/OrderedCollectionView";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { OrderedCollectionViewDetail } from "../../../src/shared/types";

const TYPE_DB = "0000000000000000000000000D";
const SCENE_ID = "scene111111111111111111111111111";

const view: OrderedCollectionViewDetail = {
  configId: "scenes-by-book",
  typeDatabaseId: TYPE_DB,
  typeDatabaseTitle: "Scenes",
  viewAssociation: "000000000000000000000000A2",
  memberSidePerspective: "000000000000000000000000A2:1",
  tabs: {
    kind: "generated",
    items: [
      { id: "bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "TWOLD", kind: "generated" },
      { id: "bookbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", label: "Fairytale", kind: "generated" },
    ],
    activeTabId: "bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  groups: [
    {
      groupId: "part1111111111111111111111111111",
      title: "Part 1",
      rows: [
        {
          sceneId: SCENE_ID,
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
  columns: ["solutions", "characters", "location"],
  columnDefs: [
    { key: "solutions", name: "Solutions", type: "relation", relationType: "solutions" },
    { key: "characters", name: "📁 Characters", type: "relation", relationType: "characters" },
    { key: "location", name: "📁 Location", type: "relation", relationType: "location" },
  ],
};

describe("OrderedCollectionView", () => {
  test("renders book tabs and schema-driven column headers", () => {
    const api = makeMockEditorApi();

    const { getByRole, getAllByText, queryByRole } = render(
      <OrderedCollectionView
        api={api}
        nodeId="bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        configId="scenes-by-book"
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

  test("filters scene rows and hides empty groups", () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    const api = makeMockEditorApi();

    const { getByRole, queryByRole } = render(
      <OrderedCollectionView
        api={api}
        nodeId="bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        configId="scenes-by-book"
        view={view}
        onTabSelect={() => {}}
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(getByRole("searchbox", { name: "Filter table rows by name" }), {
      target: { value: "opening" },
    });

    expect(getByRole("link", { name: "Opening" })).toBeTruthy();
    expect(queryByRole("heading", { name: "Unassigned", level: 3 })).toBeNull();
    expect((getByRole("searchbox", { name: "Filter table rows by name" }) as HTMLInputElement).value).toBe(
      "opening",
    );
    expect(window.location.search).toContain("search_items=opening");
  });

  test("shows empty match message when no scenes match", () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc&search_items=missing");
    const api = makeMockEditorApi();

    const { getByText } = render(
      <OrderedCollectionView
        api={api}
        nodeId="bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        configId="scenes-by-book"
        view={view}
        onTabSelect={() => {}}
        onViewChange={() => {}}
      />,
    );

    expect(getByText('No rows match “missing”.')).toBeTruthy();
  });

  test("unlinks rows with memberSidePerspective from the view payload", async () => {
    const unlinkOutgoingRelationship = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      unlinkOutgoingRelationship,
    };
    const customView: OrderedCollectionViewDetail = {
      ...view,
      viewAssociation: "000000000000000000000000B6",
      memberSidePerspective: "000000000000000000000000B6:1",
    };

    render(
      <OrderedCollectionView
        api={api}
        nodeId="bookaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        configId="scenes-by-book"
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
