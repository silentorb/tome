import { documentToStorageBody } from "tome-db/document-to-storage-body";
import {
  documentsEqual,
  emptyNodeBodyDocument,
  type NodeBodyDocument,
} from "tome-graph-interfaces";
import { isPersistableNodeTitle } from "../shared/types";

export type PendingSavePayload = { document?: NodeBodyDocument; title?: string };

export function bodyNeedsSave(
  nextDocument: NodeBodyDocument | null,
  savedDocument: NodeBodyDocument | null,
): boolean {
  if (nextDocument === null || savedDocument === null) return false;
  return !documentsEqual(nextDocument, savedDocument);
}

export function titleNeedsSave(nextTitle: string, savedTitle: string | null): boolean {
  if (savedTitle === null) return false;
  const trimmed = nextTitle.trim();
  if (!isPersistableNodeTitle(trimmed)) return false;
  return trimmed !== savedTitle;
}

/** Build a combined PATCH payload for dirty pending fields, or null when nothing to flush. */
export function buildPendingSavePayload(
  pendingBody: NodeBodyDocument | null,
  pendingTitle: string | null,
  savedDocument: NodeBodyDocument | null,
  savedTitle: string | null,
): PendingSavePayload | null {
  const patch: PendingSavePayload = {};
  if (pendingBody !== null && savedDocument !== null && !documentsEqual(pendingBody, savedDocument)) {
    patch.document = pendingBody;
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

export function storageBodyForCreate(document: NodeBodyDocument): string {
  return documentToStorageBody(document).trimEnd();
}

export { emptyNodeBodyDocument };
