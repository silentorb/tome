/** Apply per-view hidden column keys to an ordered column list. */
export function applyHiddenColumns(
  orderedColumns: string[],
  hiddenColumns?: string[],
): { visibleColumns: string[]; hiddenSet: Set<string> } {
  const hiddenSet = new Set(hiddenColumns ?? []);
  if (hiddenSet.size === 0) {
    return { visibleColumns: orderedColumns, hiddenSet };
  }
  return {
    visibleColumns: orderedColumns.filter((key) => !hiddenSet.has(key)),
    hiddenSet,
  };
}
