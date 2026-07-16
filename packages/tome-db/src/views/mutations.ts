import type { ContentStore } from "tome-flatfile";
import {
  emptyViewsFile,
  isViewDefinition,
  slugifyTabId,
  uniqueTabId,
  DEFAULT_VIEW,
  type ViewDefinition,
  type ViewSortSpec,
  type ViewsFile,
} from "tome-flatfile";
import {
  generatedViewForRelationship,
  indicesForRelationship,
  siblingViewProperties,
  viewsForNode,
  viewsForRelationship,
} from "./index";
import type { ViewsMutationError } from "tome-graph-interfaces";

export type { ViewsMutationError } from "tome-graph-interfaces";

function writeViews(store: ContentStore, file: ViewsFile): void {
  store.writeViewsFile(file);
}

function normalizeProperties(properties: string[]): string[] {
  return properties.map((key) => key.trim()).filter(Boolean);
}

function ensureCustomViews(
  file: ViewsFile,
  nodeId: string,
  association: string,
): ViewDefinition[] {
  if (generatedViewForRelationship(file, nodeId, association)) {
    throw new Error("not_custom_views");
  }
  return viewsForRelationship(file, nodeId, association);
}

function findViewIndex(
  file: ViewsFile,
  nodeId: string,
  association: string,
  viewId: string,
): number {
  const normalized = nodeId;
  return file.views.findIndex(
    (view) =>
      isViewDefinition(view) &&
      view.nodeId === normalized &&
      view.association === association &&
      view.id === viewId,
  );
}

function setPropertiesOnRecord(
  record: { properties?: string[] },
  properties: string[] | undefined,
): void {
  if (properties === undefined) {
    delete record.properties;
    return;
  }
  const normalized = normalizeProperties(properties);
  if (normalized.length > 0) {
    record.properties = normalized;
  } else {
    delete record.properties;
  }
}

export function getNodeViews(store: ContentStore, nodeId: string): ViewDefinition[] {
  const file = store.readViewsFile();
  return viewsForNode(file, nodeId).filter(isViewDefinition);
}

export function createView(
  store: ContentStore,
  nodeId: string,
  association: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
): ViewDefinition {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("invalid_name");

  const file = store.readViewsFile();
  if (generatedViewForRelationship(file, nodeId, association)) {
    throw new Error("not_custom_views");
  }

  const existing = viewsForRelationship(file, nodeId, association);
  const existingIds = new Set(existing.map((view) => view.id));
  const id = uniqueTabId(slugifyTabId(trimmed), existingIds);
  const siblingProperties =
    input.properties ?? siblingViewProperties(file, nodeId, association);
  const view: ViewDefinition = {
    id,
    nodeId,
    association,
    name: trimmed,
    sorts: input.sorts ?? [{ column: "name", direction: "asc" }],
    ...(siblingProperties?.length ? { properties: [...siblingProperties] } : {}),
  };
  file.views.push(view);
  writeViews(store, file);
  return view;
}

/** @deprecated Use createView */
export const createTab = createView;

export function updateView(
  store: ContentStore,
  nodeId: string,
  association: string,
  viewId: string,
  input: {
    name?: string;
    sorts?: ViewSortSpec[];
    properties?: string[];
  },
): ViewDefinition {
  const file = store.readViewsFile();
  const index = findViewIndex(file, nodeId, association, viewId);
  if (index < 0) throw new Error("view_not_found");

  const view = file.views[index] as ViewDefinition;
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("invalid_name");
    view.name = trimmed;
  }
  if (input.sorts !== undefined) {
    view.sorts = input.sorts;
  }
  if (input.properties !== undefined) {
    setPropertiesOnRecord(view, input.properties);
  }

  writeViews(store, file);
  return view;
}

/** @deprecated Use updateView */
export const updateTab = updateView;

export function deleteView(
  store: ContentStore,
  nodeId: string,
  association: string,
  viewId: string,
): void {
  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, association);
  if (views.length <= 1) throw new Error("last_view");

  const index = findViewIndex(file, nodeId, association, viewId);
  if (index < 0) throw new Error("view_not_found");
  file.views.splice(index, 1);
  writeViews(store, file);
}

/** @deprecated Use deleteView */
export const deleteTab = deleteView;

export function reorderViews(
  store: ContentStore,
  nodeId: string,
  association: string,
  viewIds: string[],
): ViewDefinition[] {
  if (!Array.isArray(viewIds) || viewIds.length === 0) {
    throw new Error("invalid_view_order");
  }

  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, association);
  if (viewIds.length !== views.length) {
    throw new Error("invalid_view_order");
  }

  const byId = new Map(views.map((view) => [view.id, view]));
  const reordered: ViewDefinition[] = [];
  for (const viewId of viewIds) {
    const view = byId.get(viewId);
    if (!view) throw new Error("invalid_view_order");
    reordered.push(view);
  }

  const indices = indicesForRelationship(file, nodeId, association);
  if (indices.length !== reordered.length) {
    throw new Error("invalid_view_order");
  }

  for (let offset = 0; offset < indices.length; offset += 1) {
    file.views[indices[offset]!] = reordered[offset]!;
  }

  writeViews(store, file);
  return reordered;
}

/** @deprecated Use reorderViews */
export const reorderSectionTabs = reorderViews;

/**
 * Update shared properties on a generated view record, or create/update a default
 * custom view when the association uses custom views and none exist yet.
 * Used by ordered-collection / generated tabs (shared allowlist).
 */
export function updateRelationshipViewProperties(
  store: ContentStore,
  nodeId: string,
  association: string,
  properties: string[],
): string[] {
  const normalized = normalizeProperties(properties);
  if (normalized.length === 0) throw new Error("invalid_column_order");

  const file = store.readViewsFile();
  const generated = generatedViewForRelationship(file, nodeId, association);
  if (generated) {
    setPropertiesOnRecord(generated, normalized);
    writeViews(store, file);
    return normalized;
  }

  let views = viewsForRelationship(file, nodeId, association);
  if (views.length === 0) {
    const defaultView: ViewDefinition = {
      ...DEFAULT_VIEW,
      nodeId,
      association,
      properties: [...normalized],
    };
    file.views.push(defaultView);
    writeViews(store, file);
    return normalized;
  }

  // Relationship-wide PATCH for custom associations is not used for sibling sync;
  // callers should updateView per tab. Keep writing the first view for API compatibility
  // when patching generated-style shared config on a single-view custom association.
  setPropertiesOnRecord(views[0]!, normalized);
  writeViews(store, file);
  return normalized;
}

/** @deprecated Use updateRelationshipViewProperties */
export function updateSectionColumnOrder(
  store: ContentStore,
  nodeId: string,
  association: string,
  columnOrder: string[],
): string[] {
  return updateRelationshipViewProperties(store, nodeId, association, columnOrder);
}

export function ensureCustomViewsForRelationship(
  store: ContentStore,
  nodeId: string,
  association: string,
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[],
): void {
  const file = store.readViewsFile();
  const normalized = nodeId;
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.association === association),
  );
  for (const definition of definitions) {
    file.views.push({
      id: definition.id,
      nodeId: normalized,
      association,
      name: definition.name,
      sorts: definition.sorts,
    });
  }
  writeViews(store, file);
}

export function ensureGeneratedView(
  store: ContentStore,
  nodeId: string,
  association: string,
  generator: string,
): void {
  const file = store.readViewsFile();
  const normalized = nodeId;
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.association === association),
  );
  file.views.push({ nodeId: normalized, association, generator });
  writeViews(store, file);
}

export function replaceViewsFile(store: ContentStore, file: ViewsFile): void {
  writeViews(store, file);
}

export function readViewsFileOrEmpty(store: ContentStore): ViewsFile {
  try {
    return store.readViewsFile();
  } catch {
    return emptyViewsFile();
  }
}

/** Remove a column key from view properties and reset sorts that reference it. */
export function purgeColumnFromViews(
  store: ContentStore,
  nodeId: string,
  association: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const generated = generatedViewForRelationship(file, nodeId, association);
  let changed = false;

  if (generated?.properties?.includes(columnKey)) {
    setPropertiesOnRecord(
      generated,
      generated.properties.filter((key) => key !== columnKey),
    );
    changed = true;
  }

  for (const view of viewsForRelationship(file, nodeId, association)) {
    if (view.properties?.includes(columnKey)) {
      setPropertiesOnRecord(
        view,
        view.properties.filter((key) => key !== columnKey),
      );
      changed = true;
    }
    if (view.sorts.some((sort) => sort.column === columnKey)) {
      view.sorts = [{ column: "name", direction: "asc" }];
      changed = true;
    }
  }

  if (changed) writeViews(store, file);
}

/** Rename a column key in view properties and sorts. */
export function renameColumnInViews(
  store: ContentStore,
  nodeId: string,
  association: string,
  oldKey: string,
  newKey: string,
): void {
  const file = store.readViewsFile();
  const generated = generatedViewForRelationship(file, nodeId, association);
  let changed = false;

  if (generated?.properties?.includes(oldKey)) {
    setPropertiesOnRecord(
      generated,
      generated.properties.map((key) => (key === oldKey ? newKey : key)),
    );
    changed = true;
  }

  for (const view of viewsForRelationship(file, nodeId, association)) {
    if (view.properties?.includes(oldKey)) {
      setPropertiesOnRecord(
        view,
        view.properties.map((key) => (key === oldKey ? newKey : key)),
      );
      changed = true;
    }
    for (const sort of view.sorts) {
      if (sort.column === oldKey) {
        sort.column = newKey;
        changed = true;
      }
    }
  }

  if (changed) writeViews(store, file);
}

/**
 * Append a column key to the active custom view's properties, or to the shared
 * generated record properties when the association is generated.
 * Does not fan out to sibling custom views.
 */
export function appendColumnToViewsOrder(
  store: ContentStore,
  nodeId: string,
  association: string,
  columnKey: string,
  viewId?: string,
): void {
  const file = store.readViewsFile();
  const generated = generatedViewForRelationship(file, nodeId, association);

  if (generated) {
    if (!generated.properties?.length) return;
    if (generated.properties.includes(columnKey)) return;
    setPropertiesOnRecord(generated, [...generated.properties, columnKey]);
    writeViews(store, file);
    return;
  }

  const views = viewsForRelationship(file, nodeId, association);
  if (views.length === 0) return;

  const target =
    viewId != null
      ? views.find((view) => view.id === viewId)
      : undefined;
  if (!target) return;
  if (!target.properties?.length) return;
  if (target.properties.includes(columnKey)) return;
  setPropertiesOnRecord(target, [...target.properties, columnKey]);
  writeViews(store, file);
}
