import { documentToStorageBody } from "tome-db";
import type { NodeBodyDocument } from "tome-graph-interfaces";
import { isPersistableNodeTitle } from "../shared/types";
import { stripLeadingTitleHeading } from "./markdown-body";
import {
  documentsEqual,
  editorMarkdownToDocument,
} from "./body-document-projection";

/** Editor markdown → storage markdown (tests / createNode body). */
export function normalizeEditorBody(body: string, title: string): string {
  const normalized = stripLeadingTitleHeading(body.replace(/\r\n/g, "\n"), title);
  return documentToStorageBody(editorMarkdownToDocument(normalized)).trimEnd();
}

export function editorMarkdownToSaveDocument(
  body: string,
  title: string,
): NodeBodyDocument {
  const normalized = stripLeadingTitleHeading(body.replace(/\r\n/g, "\n"), title);
  return editorMarkdownToDocument(normalized);
}

export function bodyNeedsSave(
  nextBody: string,
  savedDocument: NodeBodyDocument | null,
  title: string,
): boolean {
  if (savedDocument === null) return false;
  return !documentsEqual(editorMarkdownToSaveDocument(nextBody, title), savedDocument);
}

export function titleNeedsSave(nextTitle: string, savedTitle: string | null): boolean {
  if (savedTitle === null) return false;
  const trimmed = nextTitle.trim();
  if (!isPersistableNodeTitle(trimmed)) return false;
  return trimmed !== savedTitle;
}

export type PendingSavePayload = { document?: NodeBodyDocument; title?: string };

/** Build a combined PUT patch for dirty pending fields, or null when nothing to flush. */
export function buildPendingSavePayload(
  pendingBody: string | null,
  pendingTitle: string | null,
  savedDocument: NodeBodyDocument | null,
  savedTitle: string | null,
  pageTitle: string,
): PendingSavePayload | null {
  const patch: PendingSavePayload = {};
  if (pendingBody !== null && savedDocument !== null) {
    const nextDoc = editorMarkdownToSaveDocument(pendingBody, pageTitle);
    if (!documentsEqual(nextDoc, savedDocument)) {
      patch.document = nextDoc;
    }
  }
  if (pendingTitle !== null && savedTitle !== null) {
    const trimmed = pendingTitle.trim();
    if (isPersistableNodeTitle(trimmed) && trimmed !== savedTitle) {
      patch.title = trimmed;
    }
  }
  if (patch.document === undefined && patch.title === undefined) return null;
  return patch;
}
