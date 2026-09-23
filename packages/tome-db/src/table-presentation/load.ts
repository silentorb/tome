import { loadViewsFromContent, isGeneratedViewRecord } from "tome-flatfile";
import { resolveContentPath } from "tome-flatfile";
import type {
  GeneratedViewRecord,
  TablePresentationComposition,
  TablePresentationLayers,
} from "tome-graph-interfaces";

/** Build a runtime composition from a generated view record. */
export function compositionFromGeneratedView(
  view: GeneratedViewRecord,
): TablePresentationComposition {
  return {
    id: view.nodeId,
    typeDatabaseId: view.nodeId,
    ...view.presentation,
  };
}

export function getGeneratedViewForDatabase(
  databaseId: string,
  contentDir?: string,
): GeneratedViewRecord | null {
  const dir = contentDir ?? resolveContentPath();
  const views = loadViewsFromContent(dir);
  const match = views.views.find(
    (view): view is GeneratedViewRecord =>
      isGeneratedViewRecord(view) && view.nodeId === databaseId,
  );
  return match ?? null;
}

/** Composition for a type-table database (from its generated views.json record). */
export function getCompositionForDatabase(
  databaseId: string,
  contentDir?: string,
): TablePresentationComposition | null {
  const view = getGeneratedViewForDatabase(databaseId, contentDir);
  return view ? compositionFromGeneratedView(view) : null;
}

/** @deprecated Prefer getCompositionForDatabase — composition id is now the type-table nodeId. */
export function getCompositionById(
  compositionId: string,
  contentDir?: string,
): TablePresentationComposition | null {
  return getCompositionForDatabase(compositionId, contentDir);
}

export function layersHavePresentation(layers: TablePresentationLayers): boolean {
  return Boolean(layers.scope || layers.groups || layers.sequence);
}
