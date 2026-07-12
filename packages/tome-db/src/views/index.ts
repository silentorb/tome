import {
  isGeneratedViewRecord,
  isViewDefinition,
  type GeneratedViewRecord,
  type ViewDefinition,
  type ViewProperties,
  type ViewsFile,
} from "tome-flatfile";

export function relationshipKey(nodeId: string, association: string): string {
  return `${nodeId}:${association}`;
}

export function viewsForNode(file: ViewsFile, nodeId: string): ViewsFile["views"] {
  return file.views.filter((view) => view.nodeId === nodeId);
}

export function viewsForRelationship(
  file: ViewsFile,
  nodeId: string,
  association: string,
): ViewDefinition[] {
  return file.views.filter(
    (view): view is ViewDefinition =>
      isViewDefinition(view) &&
      view.nodeId === nodeId &&
      view.association === association,
  );
}

export function generatedViewForRelationship(
  file: ViewsFile,
  nodeId: string,
  association: string,
): GeneratedViewRecord | null {
  const match = file.views.find(
    (view): view is GeneratedViewRecord =>
      isGeneratedViewRecord(view) &&
      view.nodeId === nodeId &&
      view.association === association,
  );
  return match ?? null;
}

export function hasGeneratedViews(
  file: ViewsFile,
  nodeId: string,
  association: string,
): boolean {
  return generatedViewForRelationship(file, nodeId, association) !== null;
}

export function columnOrderFromViews(
  file: ViewsFile,
  nodeId: string,
  association: string,
): string[] | undefined {
  const views = viewsForRelationship(file, nodeId, association);
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
  association: string,
): ViewProperties | undefined {
  const views = viewsForRelationship(file, nodeId, association);
  for (const view of views) {
    if (view.properties) return { ...view.properties };
  }
  return undefined;
}

export function indicesForRelationship(
  file: ViewsFile,
  nodeId: string,
  association: string,
): number[] {
  const indices: number[] = [];
  for (let index = 0; index < file.views.length; index += 1) {
    const view = file.views[index]!;
    if (view.nodeId === nodeId && view.association === association) {
      indices.push(index);
    }
  }
  return indices;
}
