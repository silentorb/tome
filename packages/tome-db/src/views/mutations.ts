import type { ContentStore } from "../content/store";
import {
  emptyViewsFile,
  isViewDefinition,
  slugifyTabId,
  uniqueTabId,
  DEFAULT_VIEW,
  type ViewDefinition,
  type ViewProperties,
  type ViewSortSpec,
  type ViewsFile,
} from "../content/views-file";
import {
  generatedViewForRelationship,
  indicesForRelationship,
  siblingViewProperties,
  viewsForNode,
  viewsForRelationship,
} from "./index";
import { MEMBERS_RELATIONSHIP_TYPE } from "./resolve-tabs";

export type ViewsMutationError =
  | "node_not_found"
  | "section_not_found"
  | "tab_not_found"
  | "view_not_found"
  | "last_tab"
  | "last_view"
  | "invalid_name"
  | "invalid_tab_order"
  | "invalid_view_order"
  | "not_custom_tabs"
  | "not_custom_views";

function writeViews(store: ContentStore, file: ViewsFile): void {
  store.writeViewsFile(file);
}

function ensureCustomViews(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
): ViewDefinition[] {
  if (generatedViewForRelationship(file, nodeId, relationshipType)) {
    throw new Error("not_custom_views");
  }
  return viewsForRelationship(file, nodeId, relationshipType);
}

function findViewIndex(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
  viewId: string,
): number {
  const normalized = nodeId.toLowerCase();
  return file.views.findIndex(
    (view) =>
      isViewDefinition(view) &&
      view.nodeId === normalized &&
      view.relationshipType === relationshipType &&
      view.id === viewId,
  );
}

function syncPropertiesOnSiblings(
  file: ViewsFile,
  nodeId: string,
  relationshipType: string,
  properties: ViewProperties | undefined,
): void {
  for (const view of viewsForRelationship(file, nodeId, relationshipType)) {
    if (properties?.columnOrder?.length) {
      view.properties = { columnOrder: [...properties.columnOrder] };
    } else if (properties === undefined) {
      delete view.properties;
    } else {
      view.properties = { ...properties };
    }
  }
}

export function getNodeViews(store: ContentStore, nodeId: string): ViewDefinition[] {
  const file = store.readViewsFile();
  return viewsForNode(file, nodeId).filter(isViewDefinition);
}

export function createView(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
): ViewDefinition {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("invalid_name");

  const file = store.readViewsFile();
  if (generatedViewForRelationship(file, nodeId, relationshipType)) {
    throw new Error("not_custom_views");
  }

  const existing = viewsForRelationship(file, nodeId, relationshipType);
  const existingIds = new Set(existing.map((view) => view.id));
  const id = uniqueTabId(slugifyTabId(trimmed), existingIds);
  const siblingProperties =
    input.properties ?? siblingViewProperties(file, nodeId, relationshipType);
  const view: ViewDefinition = {
    id,
    nodeId: nodeId.toLowerCase(),
    relationshipType,
    name: trimmed,
    sorts: input.sorts ?? [{ column: "name", direction: "asc" }],
    ...(siblingProperties ? { properties: { ...siblingProperties } } : {}),
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
  relationshipType: string,
  viewId: string,
  input: {
    name?: string;
    sorts?: ViewSortSpec[];
    properties?: ViewProperties;
    hiddenColumns?: string[];
  },
): ViewDefinition {
  const file = store.readViewsFile();
  const index = findViewIndex(file, nodeId, relationshipType, viewId);
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
    syncPropertiesOnSiblings(file, nodeId, relationshipType, input.properties);
  }
  if (input.hiddenColumns !== undefined) {
    const normalized = input.hiddenColumns.map((key) => key.trim()).filter(Boolean);
    if (normalized.length > 0) {
      view.hiddenColumns = normalized;
    } else {
      delete view.hiddenColumns;
    }
  }

  writeViews(store, file);
  return view;
}

/** @deprecated Use updateView */
export const updateTab = updateView;

export function deleteView(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  viewId: string,
): void {
  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, relationshipType);
  if (views.length <= 1) throw new Error("last_view");

  const index = findViewIndex(file, nodeId, relationshipType, viewId);
  if (index < 0) throw new Error("view_not_found");
  file.views.splice(index, 1);
  writeViews(store, file);
}

/** @deprecated Use deleteView */
export const deleteTab = deleteView;

export function reorderViews(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  viewIds: string[],
): ViewDefinition[] {
  if (!Array.isArray(viewIds) || viewIds.length === 0) {
    throw new Error("invalid_view_order");
  }

  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, relationshipType);
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

  const indices = indicesForRelationship(file, nodeId, relationshipType);
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

export function updateRelationshipViewProperties(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  properties: ViewProperties,
): ViewProperties {
  const columnOrder = properties.columnOrder;
  if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
    throw new Error("invalid_column_order");
  }
  const normalized = columnOrder.map((key) => key.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error("invalid_column_order");

  const file = store.readViewsFile();
  let views = viewsForRelationship(file, nodeId, relationshipType);
  if (views.length === 0) {
    const defaultView: ViewDefinition = {
      ...DEFAULT_VIEW,
      nodeId: nodeId.toLowerCase(),
      relationshipType,
    };
    file.views.push(defaultView);
    views = [defaultView];
  }

  syncPropertiesOnSiblings(file, nodeId, relationshipType, { columnOrder: normalized });
  writeViews(store, file);
  return { columnOrder: normalized };
}

/** @deprecated Use updateRelationshipViewProperties */
export function updateSectionColumnOrder(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  columnOrder: string[],
): string[] {
  const properties = updateRelationshipViewProperties(store, nodeId, relationshipType, {
    columnOrder,
  });
  return properties.columnOrder ?? [];
}

export function ensureCustomViewsForRelationship(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[],
): void {
  const file = store.readViewsFile();
  const normalized = nodeId.toLowerCase();
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.relationshipType === relationshipType),
  );
  for (const definition of definitions) {
    file.views.push({
      id: definition.id,
      nodeId: normalized,
      relationshipType,
      name: definition.name,
      sorts: definition.sorts,
    });
  }
  writeViews(store, file);
}

/** @deprecated Use ensureCustomViewsForRelationship */
export const ensureCustomItemsSection = (
  store: ContentStore,
  nodeId: string,
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[],
) => ensureCustomViewsForRelationship(store, nodeId, MEMBERS_RELATIONSHIP_TYPE, definitions);

export function ensureGeneratedView(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  generator: string,
): void {
  const file = store.readViewsFile();
  const normalized = nodeId.toLowerCase();
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.relationshipType === relationshipType),
  );
  file.views.push({ nodeId: normalized, relationshipType, generator });
  writeViews(store, file);
}

/** @deprecated Use ensureGeneratedView */
export const ensureGeneratedItemsSection = (
  store: ContentStore,
  nodeId: string,
  generator: string,
) => ensureGeneratedView(store, nodeId, MEMBERS_RELATIONSHIP_TYPE, generator);

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
  relationshipType: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, relationshipType);
  if (views.length === 0) return;

  let changed = false;
  for (const view of views) {
    const order = view.properties?.columnOrder;
    if (order?.includes(columnKey)) {
      const next = order.filter((key) => key !== columnKey);
      if (next.length > 0) {
        view.properties = { columnOrder: next };
      } else {
        delete view.properties;
      }
      changed = true;
    }
    if (view.hiddenColumns?.includes(columnKey)) {
      const next = view.hiddenColumns.filter((key) => key !== columnKey);
      if (next.length > 0) {
        view.hiddenColumns = next;
      } else {
        delete view.hiddenColumns;
      }
      changed = true;
    }
    if (view.sorts.some((sort) => sort.column === columnKey)) {
      view.sorts = [{ column: "name", direction: "asc" }];
      changed = true;
    }
  }

  if (changed) {
    const first = views[0]?.properties;
    syncPropertiesOnSiblings(file, nodeId, relationshipType, first);
    writeViews(store, file);
  }
}

/** Rename a column key in view properties and sorts. */
export function renameColumnInViews(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  oldKey: string,
  newKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, relationshipType);
  if (views.length === 0) return;

  let changed = false;
  for (const view of views) {
    const order = view.properties?.columnOrder;
    if (order?.includes(oldKey)) {
      view.properties = {
        columnOrder: order.map((key) => (key === oldKey ? newKey : key)),
      };
      changed = true;
    }
    if (view.hiddenColumns?.includes(oldKey)) {
      view.hiddenColumns = view.hiddenColumns.map((key) => (key === oldKey ? newKey : key));
      changed = true;
    }
    for (const sort of view.sorts) {
      if (sort.column === oldKey) {
        sort.column = newKey;
        changed = true;
      }
    }
  }

  if (changed) {
    const first = views[0]?.properties;
    syncPropertiesOnSiblings(file, nodeId, relationshipType, first);
    writeViews(store, file);
  }
}

/** Append a column key to view properties when views exist for the relationship. */
export function appendColumnToViewsOrder(
  store: ContentStore,
  nodeId: string,
  relationshipType: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, relationshipType);
  if (views.length === 0) return;

  const order = views[0]?.properties?.columnOrder ?? [];
  if (!order.includes(columnKey)) {
    syncPropertiesOnSiblings(file, nodeId, relationshipType, {
      columnOrder: [...order, columnKey],
    });
    writeViews(store, file);
  }
}
