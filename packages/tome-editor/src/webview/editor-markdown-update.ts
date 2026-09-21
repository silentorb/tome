/**
 * Decide whether an editor document update should affect autosave.
 * Baseline must be captured at editor create — never from the first user edit —
 * otherwise page-block attr-only changes (e.g. query graph edits) never reach save.
 */
export function classifyDocumentUpdate(input: {
  destroyed: boolean;
  editorReady: boolean;
  baselineCaptured: boolean;
  sameDoc: boolean;
}): "ignore" | "save" {
  if (input.destroyed || !input.editorReady || !input.baselineCaptured) return "ignore";
  if (input.sameDoc) return "ignore";
  return "save";
}
