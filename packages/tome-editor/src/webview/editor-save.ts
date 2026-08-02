import { collapsePageBlockEmbedsForStorage } from "tome-interfaces/page-block";
import { canonicalizeMarkdownBodyLinks } from "tome-flatfile/markdown-links";
import { collapseDynamicEditorLinks } from "tome-flatfile/dynamic-node-links";
import { isPersistableNodeTitle } from "../shared/types";
import { stripLeadingTitleHeading } from "./markdown-body";

/** Normalize markdown for comparing editor output against the last saved body. */
export function normalizeEditorBody(body: string, title: string): string {
  const normalized = stripLeadingTitleHeading(body.replace(/\r\n/g, "\n"), title);
  const collapsedBlocks = collapsePageBlockEmbedsForStorage(normalized);
  const collapsed = collapseDynamicEditorLinks(collapsedBlocks);
  return canonicalizeMarkdownBodyLinks(collapsed).trimEnd();
}

export function bodyNeedsSave(nextBody: string, savedBody: string | null, title: string): boolean {
  if (savedBody === null) return false;
  return normalizeEditorBody(nextBody, title) !== savedBody;
}

export function titleNeedsSave(nextTitle: string, savedTitle: string | null): boolean {
  if (savedTitle === null) return false;
  const trimmed = nextTitle.trim();
  if (!isPersistableNodeTitle(trimmed)) return false;
  return trimmed !== savedTitle;
}

export type PendingSavePayload = { body?: string; title?: string };

/** Build a combined PUT patch for dirty pending fields, or null when nothing to flush. */
export function buildPendingSavePayload(
  pendingBody: string | null,
  pendingTitle: string | null,
  savedBody: string | null,
  savedTitle: string | null,
): PendingSavePayload | null {
  const patch: PendingSavePayload = {};
  if (pendingBody !== null && savedBody !== null && pendingBody !== savedBody) {
    patch.body = pendingBody;
  }
  if (pendingTitle !== null && savedTitle !== null) {
    const trimmed = pendingTitle.trim();
    if (isPersistableNodeTitle(trimmed) && trimmed !== savedTitle) {
      patch.title = trimmed;
    }
  }
  if (patch.body === undefined && patch.title === undefined) return null;
  return patch;
}
