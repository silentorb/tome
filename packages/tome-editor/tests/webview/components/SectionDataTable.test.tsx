import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionDataTable } from "../../../src/webview/components/SectionDataTable";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

describe("SectionDataTable", () => {
  test("preserves server row order when tab defaultSort is set and user has not overridden", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="test-tab-sort"
          columns={["priority"]}
          columnLabels={{ priority: "Priority" }}
          defaultSort={{ orderBy: [{ column: "priority", direction: "desc" }] }}
          rows={[
            { id: "b", name: "Beta", cells: { priority: "High" } },
            { id: "a", name: "Alpha", cells: { priority: "Low" } },
          ]}
          renderNameCell={(row) => row.name}
        />
      </UserSettingsProvider>,
    );

    const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Beta");
    expect(names[1]).toContain("Alpha");
    expect(
      screen.getByRole("button", { name: "Priority" }).getAttribute("aria-sort"),
    ).toBe("descending");
  });

  test("sorts rows when a column header is clicked", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="test-table"
          columns={["priority"]}
          columnLabels={{ priority: "Priority" }}
          rows={[
            { id: "a", name: "Alpha", cells: { priority: "Low" } },
            { id: "b", name: "Beta", cells: { priority: "High" } },
          ]}
          renderNameCell={(row) => row.name}
        />
      </UserSettingsProvider>,
    );

    const priorityHeader = screen.getByRole("button", { name: "Priority" });
    fireEvent.click(priorityHeader);

    let names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Alpha");
    expect(names[1]).toContain("Beta");

    fireEvent.click(priorityHeader);

    names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Beta");
    expect(names[1]).toContain("Alpha");
  });

  test("renders row page actions when rowPageActions is provided", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="test-row-actions"
          columns={[]}
          rows={[{ id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Row A", cells: {} }]}
          renderNameCell={(row) => row.name}
          rowPageActions={{
            onArchiveNode: async () => {},
            onRemoveNode: async () => {},
            onDeleteNode: async () => {},
          }}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByRole("button", { name: "Page actions" })).toBeTruthy();
    expect(screen.getByText("⋮")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Row actions" })).toBeTruthy();
    const headerRow = screen.getAllByRole("row")[0]!;
    expect(headerRow.querySelector('[aria-label="Page actions"]')).toBeNull();
  });

  test("renders add-row footer when provided via custom cell renderer", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="test-table-plain"
          columns={["status"]}
          rows={[{ id: "a", name: "Row", cells: { status: "Open" } }]}
          renderNameCell={(row) => row.name}
          renderCell={(column, value) => `${column}:${value}`}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByText("status:Open")).toBeTruthy();
  });

  test("does not render column drag handles when reorder is enabled", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="test-column-reorder"
          columns={["priority", "status"]}
          rows={[{ id: "a", name: "Row", cells: { priority: "Low", status: "Open" } }]}
          renderNameCell={(row) => row.name}
          onColumnsReorder={async () => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.queryByRole("button", { name: /Reorder .* column/ })).toBeNull();
    expect(document.querySelectorAll(".tome-column-header.is-reorderable")).toHaveLength(2);
  });
});
