export function columnLabelFor(
  column: string,
  columnDefs?: { key: string; name: string }[],
  columnLabels?: Record<string, string>,
): string {
  if (columnLabels?.[column]) return columnLabels[column]!;
  const def = columnDefs?.find((entry) => entry.key === column);
  if (def?.name) return def.name;
  if (column === "name") return "Name";
  return column
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
