/** Human-readable label for a local relationship type (e.g. `bible_passages` → `Bible Passages`). */
export function formatRelationshipTypeLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
