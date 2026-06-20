import type { RelationLink } from "./relation-link";

/** Row shape for relation-column sort helpers (browser-safe; no filesystem deps). */
export interface RelationSortRow {
  relationCells?: Record<string, RelationLink[]>;
}

/** True when either row has hydrated relation links for this column key. */
export function isRelationColumnSort(
  left: Pick<RelationSortRow, "relationCells">,
  right: Pick<RelationSortRow, "relationCells">,
  column: string,
): boolean {
  return (
    left.relationCells?.[column] !== undefined ||
    right.relationCells?.[column] !== undefined
  );
}

/** Default relation-field sort: link count (SUM). */
export function relationLinkCount(
  row: Pick<RelationSortRow, "relationCells">,
  column: string,
): number {
  return row.relationCells?.[column]?.length ?? 0;
}
