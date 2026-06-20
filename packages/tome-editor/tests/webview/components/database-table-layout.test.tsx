import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SectionDataTable } from "../../../src/webview/components/SectionDataTable";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

const COMPONENT_DIR = import.meta.dir;

function loadTableStyles(): HTMLStyleElement {
  const css = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/database-table-view.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  style.dataset.testTableLayout = "true";
  document.head.append(style);
  return style;
}

describe("database table layout CSS", () => {
  const css = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/database-table-view.css"), "utf8");
  const sectionTableCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/section-data-table.css"), "utf8");

  test("caps column widths with simple max-width rules", () => {
    expect(css).toContain("max-width: 21rem");
    expect(css).toContain("max-width: 16.8rem");
    expect(css).toContain("max-width: 14rem");
    expect(css).not.toMatch(/table-layout:\s*fixed/);
    expect(css).not.toMatch(/colgroup/);
    expect(css).not.toMatch(/tome-table-name-col/);
  });

  test("scrolls horizontally on the page shell, not inside the table wrap", () => {
    expect(css).toMatch(/\.tome-database-table-wrap[\s\S]*width:\s*fit-content/);
    expect(css).toMatch(/\.tome-database-table-wrap[\s\S]*overflow:\s*visible/);
    expect(css).not.toMatch(/\.tome-database-table-wrap[\s\S]*overflow:\s*auto/);

    const mainCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/styles.css"), "utf8");
    expect(mainCss).toMatch(/\.tome-main[\s\S]*overflow:\s*auto/);
  });

  test("column header context menu fills thead cell padding", () => {
    expect(sectionTableCss).toMatch(/\.tome-column-header-menu-wrap[\s\S]*display:\s*block/);
    expect(sectionTableCss).toMatch(
      /\.tome-database-table thead th > \.tome-column-header-menu-wrap[\s\S]*margin:\s*-10px -14px/,
    );
    expect(sectionTableCss).toMatch(
      /\.tome-database-table thead th > \.tome-column-header-menu-wrap[\s\S]*padding:\s*10px 14px/,
    );
  });

  test("column header hover highlight applies to full thead cell", () => {
    expect(sectionTableCss).toMatch(
      /\.tome-database-table thead th:hover:not\(\.tome-table-row-actions-col\):not\([\s\S]*\.tome-ordered-association-drag-col[\s\S]*\)[\s\S]*color:\s*var\(--tome-text\)/,
    );
    expect(sectionTableCss).not.toMatch(/\.tome-table-sort-button:hover/);
  });
});

describe("SectionDataTable column layout", () => {
  let style: HTMLStyleElement | undefined;

  afterEach(() => {
    style?.remove();
    style = undefined;
  });

  test("applies max-width caps from stylesheet", () => {
    style = loadTableStyles();
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <SectionDataTable
          tableKey="layout-max-width"
          columns={["priority"]}
          rows={[{ id: "row1", name: "Row", cells: { priority: "High" } }]}
          renderNameCell={(row) => row.name}
        />
      </UserSettingsProvider>,
    );

    const table = screen.getByRole("table");
    const wrap = table.closest(".tome-database-table-wrap") as HTMLElement;
    const nameCell = screen.getByRole("rowheader");
    const dataHeader = screen.getByRole("columnheader", { name: "Priority" });

    expect(getComputedStyle(wrap).overflow).toBe("visible");
    expect(getComputedStyle(nameCell).maxWidth).toBe("336px");
    expect(getComputedStyle(dataHeader).maxWidth).toBe("268.8px");
  });
});
