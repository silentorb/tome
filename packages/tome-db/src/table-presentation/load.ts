import {
  loadTablePresentationFromContent,
  resolveContentPath,
} from "tome-flatfile";
import type { TablePresentationComposition } from "tome-graph-interfaces";

export function getCompositionById(
  compositionId: string,
  contentDir?: string,
): TablePresentationComposition | null {
  const dir = contentDir ?? resolveContentPath();
  return (
    loadTablePresentationFromContent(dir).compositions.find((c) => c.id === compositionId) ??
    null
  );
}

export function getCompositionForDatabase(
  databaseId: string,
  contentDir?: string,
): TablePresentationComposition | null {
  const dir = contentDir ?? resolveContentPath();
  return (
    loadTablePresentationFromContent(dir).compositions.find(
      (c) => c.typeDatabaseId === databaseId,
    ) ?? null
  );
}
