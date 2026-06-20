import { describe, expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { OrderedAssociationView } from "../../../src/webview/components/OrderedAssociationView";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { OrderedAssociationViewDetail } from "../../../src/shared/types";

const view: OrderedAssociationViewDetail = {
  configId: "scenes-by-book",
  typeDatabaseId: "204dba198db74611b0b49a98dd53e8f5",
  typeDatabaseTitle: "Scenes",
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
          sceneId: "scene111111111111111111111111111",
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

describe("OrderedAssociationView", () => {
  test("renders book tabs and schema-driven column headers", () => {
    const api = makeMockEditorApi();

    const { getByRole, getAllByRole, getAllByText, queryByRole } = render(
      <OrderedAssociationView
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

    const { getByRole, queryByRole, getByText } = render(
      <OrderedAssociationView
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
      <OrderedAssociationView
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
});
