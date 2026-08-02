/** Display fallback and rejected persisted title for empty / default new pages. */
export const NON_PERSISTABLE_NODE_TITLE = "Untitled";

/** True when a title may be written to content (non-empty and not the default placeholder). */
export function isPersistableNodeTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed !== NON_PERSISTABLE_NODE_TITLE;
}
