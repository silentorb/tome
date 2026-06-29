import {
  isGeneratedViewRecord,
  isViewDefinition,
  type GeneratedViewRecord,
  type ViewDefinition,
  type ViewProperties,
  type ViewsFile,
} from "../content/views-file";

export function relationshipKey(nodeId: string, relationshipType: string): string {
  return `${nodeId}:${relationshipType}`;
}

export function viewsForNode(file: ViewsFile, nodeId: string): ViewsFile["views"] {
  const normalized = nodeId.toLowerCase();
  return file.views.filter((view) => view.nodeId === normalized);
}

export function viewsForRelationship(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): ViewDefinition[] {
  const normalized = nodeId.toLowerCase();
  return file.views.filter(
    (view): view is ViewDefinition =>
      isViewDefinition(view) &&
      view.nodeId === normalized &&
      view.relationshipType === relationshipType,
  );
}

export function generatedViewForRelationship(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): GeneratedViewRecord | null {
  const normalized = nodeId.toLowerCase();
  const match = file.views.find(
    (view): view is GeneratedViewRecord =>
      isGeneratedViewRecord(view) &&
      view.nodeId === normalized &&
      view.relationshipType === relationshipType,
  );
  return match ?? null;
}

export function hasGeneratedViews(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): boolean {
  return generatedViewForRelationship(file, nodeId, relationshipType) !== null;
}

export function columnOrderFromViews(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): string[] | undefined {
  const views = viewsForRelationship(file, nodeId, relationshipType);
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
  relationshipType: string,
): ViewProperties | undefined {
  const views = viewsForRelationship(file, nodeId, relationshipType);
  for (const view of views) {
    if (view.properties) return { ...view.properties };
  }
  return undefined;
}

export function indicesForRelationship(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): number[] {
  const normalized = nodeId.toLowerCase();
  const indices: number[] = [];
  for (let index = 0; index < file.views.length; index += 1) {
    const view = file.views[index]!;
    if (view.nodeId === normalized && view.relationshipType === relationshipType) {
      indices.push(index);
    }
  }
  return indices;
}
