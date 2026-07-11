import {
  isGeneratedViewRecord,
  isViewDefinition,
  type GeneratedViewRecord,
  type ViewDefinition,
  type ViewProperties,
  type ViewsFile,
} from "tome-flatfile";

export function relationshipKey(nodeId: string, perspective: string): string {
  return `${nodeId}:${perspective}`;
}

export function viewsForNode(file: ViewsFile, nodeId: string): ViewsFile["views"] {
  return file.views.filter((view) => view.nodeId === nodeId);
}

export function viewsForRelationship(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): ViewDefinition[] {
  return file.views.filter(
    (view): view is ViewDefinition =>
      isViewDefinition(view) &&
      view.nodeId === nodeId &&
      view.perspective === perspective,
  );
}

export function generatedViewForRelationship(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): GeneratedViewRecord | null {
  const match = file.views.find(
    (view): view is GeneratedViewRecord =>
      isGeneratedViewRecord(view) &&
      view.nodeId === nodeId &&
      view.perspective === perspective,
  );
  return match ?? null;
}

export function hasGeneratedViews(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): boolean {
  return generatedViewForRelationship(file, nodeId, perspective) !== null;
}

export function columnOrderFromViews(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): string[] | undefined {
  const views = viewsForRelationship(file, nodeId, perspective);
  for (const view of views) {
    const order = view.properties?.columnOrder;
    if (order?.length) return order;
  }
  return undefined;
}

export function viewDefinitionsForTabs(
  views: ViewDefinition[],
): Pick<ViewDefinition, "id" | "name" | "sorts" | "hiddenColumns">[] {
  return views.map(({ id, name, sorts, hiddenColumns }) => ({
    id,
    name,
    sorts,
    ...(hiddenColumns ? { hiddenColumns } : {}),
  }));
}

export function siblingViewProperties(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): ViewProperties | undefined {
  const views = viewsForRelationship(file, nodeId, perspective);
  for (const view of views) {
    if (view.properties) return { ...view.properties };
  }
  return undefined;
}

export function indicesForRelationship(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): number[] {
  const indices: number[] = [];
  for (let index = 0; index < file.views.length; index += 1) {
    const view = file.views[index]!;
    if (view.nodeId === nodeId && view.perspective === perspective) {
      indices.push(index);
    }
  }
  return indices;
}
