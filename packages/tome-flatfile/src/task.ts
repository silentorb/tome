/** Leading GFM-style checkbox marker on a blockquote first paragraph (Tome task block). */
const LEADING_TASK_MARKER = /^\[([ xX])\](?:\s+|$)/;

export type TaskMarker = {
  checked: boolean;
  /** Matched prefix including trailing whitespace when present. */
  raw: string;
};

export function hasLeadingTaskMarker(text: string): boolean {
  return LEADING_TASK_MARKER.test(text.trimStart());
}

export function extractLeadingTaskMarker(text: string): TaskMarker | null {
  const match = LEADING_TASK_MARKER.exec(text.trimStart());
  if (!match) return null;
  const box = match[1]!;
  return {
    checked: box === "x" || box === "X",
    raw: match[0],
  };
}

export function taskMarkerPrefix(checked: boolean): string {
  return checked ? "[x] " : "[ ] ";
}
