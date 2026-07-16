/**
 * Apply additive properties allowlist to an ordered column list.
 * Absent → all columns visible. Present → only listed keys, in that order.
 */
export function applyViewPropertiesVisibility(
  defaultOrder: string[],
  properties?: string[],
): { visibleColumns: string[]; visibleSet: Set<string> } {
  if (!properties?.length) {
    return { visibleColumns: defaultOrder, visibleSet: new Set(defaultOrder) };
  }
  const defaultSet = new Set(defaultOrder);
  const visibleColumns: string[] = [];
  const visibleSet = new Set<string>();
  for (const key of properties) {
    if (defaultSet.has(key) && !visibleSet.has(key)) {
      visibleColumns.push(key);
      visibleSet.add(key);
    }
  }
  return { visibleColumns, visibleSet };
}

/** @deprecated Use applyViewPropertiesVisibility / applyViewProperties */
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
