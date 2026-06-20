import type { TableSortSpec } from "./site-types";

export interface ViewSortLike {
  column: string;
  direction: "asc" | "desc";
}

const DEFAULT_TABLE_SORT: TableSortSpec = {
  orderBy: [{ column: "name", direction: "asc" }],
};

export function viewSortsToTableSort(sorts: ViewSortLike[]): TableSortSpec {
  const orderBy = sorts
    .filter((sort) => typeof sort.column === "string" && sort.column.length > 0)
    .map((sort) => ({
      column: sort.column,
      direction: (sort.direction === "desc" ? "desc" : "asc") as "asc" | "desc",
    }));
  return orderBy.length > 0 ? { orderBy } : DEFAULT_TABLE_SORT;
}

export function nextSortOnColumnClick(
  current: TableSortSpec,
  column: string,
): TableSortSpec {
  const primary = current.orderBy[0];
  if (primary?.column === column) {
    return {
      orderBy: [{ column, direction: primary.direction === "asc" ? "desc" : "asc" }],
    };
  }
  return { orderBy: [{ column, direction: "asc" }] };
}

export function sortTableRows<T extends { id: string; name: string; cells: Record<string, string> }>(
  rows: T[],
  spec: TableSortSpec,
  enumOrderByColumn?: Record<string, string[]>,
): T[] {
  const orderBy = spec.orderBy.length > 0 ? spec.orderBy : DEFAULT_TABLE_SORT.orderBy;
  return [...rows].sort((left, right) => {
    for (const { column, direction } of orderBy) {
      const leftValue = column === "name" ? left.name : (left.cells[column] ?? "");
      const rightValue = column === "name" ? right.name : (right.cells[column] ?? "");
      const enumOrder = enumOrderByColumn?.[column];
      let cmp: number;
      if (enumOrder?.length) {
        const li = enumOrder.indexOf(leftValue);
        const ri = enumOrder.indexOf(rightValue);
        const leftIdx = li >= 0 ? li : enumOrder.length;
        const rightIdx = ri >= 0 ? ri : enumOrder.length;
        cmp = leftIdx - rightIdx;
        if (cmp === 0) cmp = compareStrings(leftValue, rightValue);
      } else {
        cmp = compareStrings(leftValue, rightValue);
      }
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return left.id.localeCompare(right.id);
  });
}

function compareStrings(a: string, b: string): number {
  const aEmpty = !a.trim();
  const bEmpty = !b.trim();
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function enumOrderByColumn(
  columnDefs: { key: string; options?: string[] }[] | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!columnDefs) return out;
  for (const def of columnDefs) {
    if (def.options?.length) out[def.key] = def.options;
  }
  return out;
}
