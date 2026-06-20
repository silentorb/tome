import { nextSortOnColumnClick, sortTableRows, type TableSortSpec } from "../table-sort";

function parseJsonAttribute<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function initMetadataPanels(): void {
  const expandFromUrl = new URLSearchParams(window.location.search).get("meta") === "1";

  for (const panel of document.querySelectorAll<HTMLElement>("[data-metadata-panel]")) {
    const toggle = panel.querySelector<HTMLButtonElement>("[data-metadata-toggle]");
    const body = panel.querySelector<HTMLElement>("[data-metadata-body]");
    if (!toggle || !body) continue;

    const setExpanded = (expanded: boolean) => {
      panel.classList.toggle("is-expanded", expanded);
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      const summary = toggle.querySelector<HTMLElement>(".tome-record-metadata-summary");
      if (summary) summary.hidden = expanded;
    };

    setExpanded(expandFromUrl);
    toggle.addEventListener("click", () => {
      setExpanded(toggle.getAttribute("aria-expanded") !== "true");
    });
  }
}

function readRowData(row: HTMLTableRowElement): {
  id: string;
  name: string;
  cells: Record<string, string>;
} {
  return {
    id: row.dataset.rowId ?? "",
    name: row.dataset.rowName ?? "",
    cells: parseJsonAttribute<Record<string, string>>(row.dataset.rowCells) ?? {},
  };
}

function writeRowOrder(tbody: HTMLTableSectionElement, rows: HTMLTableRowElement[]): void {
  for (const row of rows) tbody.appendChild(row);
}

function updateSortIndicators(table: HTMLElement, column: string, direction: "asc" | "desc"): void {
  for (const button of table.querySelectorAll<HTMLButtonElement>("[data-sort-column]")) {
    const col = button.dataset.sortColumn ?? "";
    const isActive = col === column;
    button.classList.toggle("is-active", isActive);
    let indicator = button.querySelector<HTMLElement>(".tome-table-sort-indicator");
    if (isActive) {
      if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "tome-table-sort-indicator";
        button.appendChild(indicator);
      }
      indicator.textContent = direction === "asc" ? "▲" : "▼";
    } else if (indicator) {
      indicator.remove();
    }
  }
}

function initSortableTables(): void {
  for (const table of document.querySelectorAll<HTMLElement>("[data-sortable-table]")) {
    const tbody = table.querySelector<HTMLTableSectionElement>("tbody");
    if (!tbody) continue;

    const defaultSort = parseJsonAttribute<TableSortSpec>(table.dataset.defaultSort);
    const enumOrder = parseJsonAttribute<Record<string, string[]>>(table.dataset.enumOrder);
    let currentSort = defaultSort ?? { orderBy: [{ column: "name", direction: "asc" as const }] };
    let userOverrode = false;

    for (const button of table.querySelectorAll<HTMLButtonElement>("[data-sort-column]")) {
      button.addEventListener("click", () => {
        const column = button.dataset.sortColumn;
        if (!column) return;
        userOverrode = true;
        currentSort = nextSortOnColumnClick(currentSort, column);
        const direction = currentSort.orderBy[0]?.direction ?? "asc";
        updateSortIndicators(table, column, direction);

        const domRows = [...tbody.querySelectorAll<HTMLTableRowElement>("tr")];
        const sorted = sortTableRows(domRows.map(readRowData), currentSort, enumOrder);
        const byId = new Map(domRows.map((row) => [row.dataset.rowId ?? "", row]));
        writeRowOrder(
          tbody,
          sorted.map((row) => byId.get(row.id)).filter((row): row is HTMLTableRowElement => row != null),
        );
      });
    }

    if (defaultSort && !userOverrode) {
      const primary = defaultSort.orderBy[0];
      if (primary) updateSortIndicators(table, primary.column, primary.direction);
    }
  }
}

function init(): void {
  initMetadataPanels();
  initSortableTables();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
