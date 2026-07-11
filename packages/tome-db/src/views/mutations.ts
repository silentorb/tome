import type { ContentStore } from "tome-flatfile";
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

function ensureCustomViews(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
): ViewDefinition[] {
  if (generatedViewForRelationship(file, nodeId, perspective)) {
    throw new Error("not_custom_views");
  }
  return viewsForRelationship(file, nodeId, perspective);
}

function findViewIndex(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
  viewId: string,
): number {
  const normalized = nodeId;
  return file.views.findIndex(
    (view) =>
      isViewDefinition(view) &&
      view.nodeId === normalized &&
      view.perspective === perspective &&
      view.id === viewId,
  );
}

function syncPropertiesOnSiblings(
  file: ViewsFile,
  nodeId: string,
  perspective: string,
  properties: ViewProperties | undefined,
): void {
  for (const view of viewsForRelationship(file, nodeId, perspective)) {
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
  perspective: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
): ViewDefinition {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("invalid_name");

  const file = store.readViewsFile();
  if (generatedViewForRelationship(file, nodeId, perspective)) {
    throw new Error("not_custom_views");
  }

  const existing = viewsForRelationship(file, nodeId, perspective);
  const existingIds = new Set(existing.map((view) => view.id));
  const id = uniqueTabId(slugifyTabId(trimmed), existingIds);
  const siblingProperties =
    input.properties ?? siblingViewProperties(file, nodeId, perspective);
  const view: ViewDefinition = {
    id,
    nodeId,
    perspective,
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
  perspective: string,
  viewId: string,
  input: {
    name?: string;
    sorts?: ViewSortSpec[];
    properties?: ViewProperties;
    hiddenColumns?: string[];
  },
): ViewDefinition {
  const file = store.readViewsFile();
  const index = findViewIndex(file, nodeId, perspective, viewId);
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
    syncPropertiesOnSiblings(file, nodeId, perspective, input.properties);
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
  perspective: string,
  viewId: string,
): void {
  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, perspective);
  if (views.length <= 1) throw new Error("last_view");

  const index = findViewIndex(file, nodeId, perspective, viewId);
  if (index < 0) throw new Error("view_not_found");
  file.views.splice(index, 1);
  writeViews(store, file);
}

/** @deprecated Use deleteView */
export const deleteTab = deleteView;

export function reorderViews(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  viewIds: string[],
): ViewDefinition[] {
  if (!Array.isArray(viewIds) || viewIds.length === 0) {
    throw new Error("invalid_view_order");
  }

  const file = store.readViewsFile();
  const views = ensureCustomViews(file, nodeId, perspective);
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

  const indices = indicesForRelationship(file, nodeId, perspective);
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
  perspective: string,
  properties: ViewProperties,
): ViewProperties {
  const columnOrder = properties.columnOrder;
  if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
    throw new Error("invalid_column_order");
  }
  const normalized = columnOrder.map((key) => key.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error("invalid_column_order");

  const file = store.readViewsFile();
  let views = viewsForRelationship(file, nodeId, perspective);
  if (views.length === 0) {
    const defaultView: ViewDefinition = {
      ...DEFAULT_VIEW,
      nodeId,
      perspective,
    };
    file.views.push(defaultView);
    views = [defaultView];
  }

  syncPropertiesOnSiblings(file, nodeId, perspective, { columnOrder: normalized });
  writeViews(store, file);
  return { columnOrder: normalized };
}

/** @deprecated Use updateRelationshipViewProperties */
export function updateSectionColumnOrder(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  columnOrder: string[],
): string[] {
  const properties = updateRelationshipViewProperties(store, nodeId, perspective, {
    columnOrder,
  });
  return properties.columnOrder ?? [];
}

export function ensureCustomViewsForRelationship(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[],
): void {
  const file = store.readViewsFile();
  const normalized = nodeId;
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.perspective === perspective),
  );
  for (const definition of definitions) {
    file.views.push({
      id: definition.id,
      nodeId: normalized,
      perspective,
      name: definition.name,
      sorts: definition.sorts,
    });
  }
  writeViews(store, file);
}

export function ensureGeneratedView(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  generator: string,
): void {
  const file = store.readViewsFile();
  const normalized = nodeId;
  file.views = file.views.filter(
    (view) => !(view.nodeId === normalized && view.perspective === perspective),
  );
  file.views.push({ nodeId: normalized, perspective, generator });
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
  perspective: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, perspective);
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
    syncPropertiesOnSiblings(file, nodeId, perspective, first);
    writeViews(store, file);
  }
}

/** Rename a column key in view properties and sorts. */
export function renameColumnInViews(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  oldKey: string,
  newKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, perspective);
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
    syncPropertiesOnSiblings(file, nodeId, perspective, first);
    writeViews(store, file);
  }
}

/** Append a column key to view properties when views exist for the relationship. */
export function appendColumnToViewsOrder(
  store: ContentStore,
  nodeId: string,
  perspective: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const views = viewsForRelationship(file, nodeId, perspective);
  if (views.length === 0) return;

  const order = views[0]?.properties?.columnOrder ?? [];
  if (!order.includes(columnKey)) {
    syncPropertiesOnSiblings(file, nodeId, perspective, {
      columnOrder: [...order, columnKey],
    });
    writeViews(store, file);
  }
}
