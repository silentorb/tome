import { sortEvalRows, type EvalRow } from "../row-sort";
import type { ViewSortSpec } from "../content/views-file";

function viewSortsToRowSorts(sorts: ViewSortSpec[]): unknown[] {
  return sorts.map((sort) => ({
    property: sort.column === "name" ? "title" : sort.column,
    direction: sort.direction === "desc" ? "descending" : "ascending",
  }));
}

export function sortEvalRowsFromViewSorts(
  rows: EvalRow[],
  sorts: ViewSortSpec[],
): EvalRow[] {
  if (sorts.length === 0) return rows;
  return sortEvalRows(rows, viewSortsToRowSorts(sorts));
}
