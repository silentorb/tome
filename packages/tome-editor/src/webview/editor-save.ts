import { canonicalizeMarkdownBodyLinks } from "tome-db/markdown-links";
import { collapseDynamicEditorLinks } from "tome-db/dynamic-node-links";
import { stripLeadingTitleHeading } from "./markdown-body";

/** Normalize markdown for comparing editor output against the last saved body. */
export function normalizeEditorBody(body: string, title: string): string {
  const normalized = stripLeadingTitleHeading(body.replace(/\r\n/g, "\n"), title);
  const collapsed = collapseDynamicEditorLinks(normalized);
  return canonicalizeMarkdownBodyLinks(collapsed);
}

export function bodyNeedsSave(nextBody: string, savedBody: string | null, title: string): boolean {
  if (savedBody === null) return false;
  return normalizeEditorBody(nextBody, title) !== savedBody;
}

export function titleNeedsSave(nextTitle: string, savedTitle: string | null): boolean {
  const trimmed = nextTitle.trim() || "Untitled";
  return savedTitle !== null && trimmed !== savedTitle;
}
