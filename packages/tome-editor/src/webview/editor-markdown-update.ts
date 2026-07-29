/**
 * Decide how a Milkdown markdownUpdated event should affect autosave.
 * Baseline must be captured at editor create — never from the first user edit —
 * otherwise page-block attr-only changes (e.g. query graph edits) never reach saveBody.
 */
export function classifyMarkdownUpdate(input: {
  destroyed: boolean;
  editorReady: boolean;
  baselineCaptured: boolean;
  markdown: string;
  prevMarkdown: string;
}): "ignore" | "save" {
  if (input.destroyed || !input.editorReady || !input.baselineCaptured) return "ignore";
  if (input.markdown === input.prevMarkdown) return "ignore";
  return "save";
}
