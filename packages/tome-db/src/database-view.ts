import type { GraphDatabase } from "./graph";
import { listSetMemberRowConnections } from "./set-membership";
import { isTypeTableNode } from "./node-capabilities";
import type { EvalRow } from "./row-sort";
import { applyDynamicFields } from "./dynamic-fields";
import { hydrateRelationCellsForRows } from "./database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "./database-column-defs";
import { enrichColumnDefs } from "./property-enums";
import { resolveContentPath } from "./content/paths";
import {
  resolveCustomTabsForNode,
  activeTabName,
  getSectionTabsConfig,
} from "./views/resolve-tabs";
import { loadViewsFromContent } from "./views/load";
import { sortEvalRowsFromViewSorts } from "./views/sort-spec";
import { applySectionColumnOrder } from "./views/column-order";
import { applyHiddenColumns } from "./views/column-visibility";
import type { TableTabsDetail } from "./views/tabs";
import { ORDER_META_KEYS } from "./ordered-relationships";
import {
  isOrderedMembershipSet,
  membershipPerspectivesForSet,
  ORDERED_PROPERTY_DEFAULT,
  viewSectionKeyForSet,
} from "./relationship-type-traits";

const ROW_META_KEYS = ORDER_META_KEYS;

import type { RelationLink } from "./relation-link";
export type { RelationLink } from "./relation-link";

export interface DatabaseRow {
  rowIndex: number;
  nodeId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
}

export interface DatabaseColumnDef {
  key: string;
  name: string;
  type: string;
  source?: "stored" | "dynamic";
  /** Workspace enum id when type is `enum` (e.g. priority). */
  enumId?: string;
  /** Allowed enum labels for dropdowns (stored values, not weights). */
  options?: string[];
  /** Default enum label when the stored value is unset. */
  defaultValue?: string;
  /** Dropdown display order for enum options (UI only; storage uses canonical options order). */
  defaultOrder?: "asc" | "desc";
  /** Graph relationship perspective when type is `relation`. */
  relationType?: string;
  /** Storage composite from relationship-types.json when type is `relation`. */
  relationshipCompositeType?: string;
  /** @deprecated Use relationshipCompositeType + registry endpoints. */
  targetDatabaseId?: string;
}

export interface DatabaseViewDetail {
  id: string;
  title: string;
  /** @deprecated Use tabs.activeTabId and active tab label from tabs.items */
  view: string;
  /** @deprecated Use tabs.items */
  views: string[];
  tabs: TableTabsDetail;
  /** Set-side perspective = views.json relationshipType / section key. */
  viewRelationshipType: string;
  /** Member-side perspective for unlink/move against this set. */
  memberSidePerspective: string;
  /** Ordered data column keys before per-view visibility filtering. */
  allColumns: string[];
  columns: string[];
  rows: DatabaseRow[];
  /** Column defs for visible columns only. */
  columnDefs?: DatabaseColumnDef[];
  /** Ordered column defs before per-view visibility filtering. */
  allColumnDefs?: DatabaseColumnDef[];
}

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

function isoFromProperties(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function stringProperty(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function cellsFromProperties(properties: Record<string, unknown>): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (ROW_META_KEYS.has(key)) continue;
    const text = stringProperty(value);
    if (text !== null) cells[key] = text;
  }
  return cells;
}

function numericOrderValue(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectLegacyViews(connectionViews: string[]): string[] {
  const views = new Set<string>();
  for (const view of connectionViews) {
    if (view) views.add(view);
  }
  if (views.size === 0) views.add("default");
  return [...views].sort((a, b) => viewSortKey(a).localeCompare(viewSortKey(b)));
}

function viewSortKey(view: string): string {
  if (view === "default") return "0";
  if (view === "all") return "1";
  return `2:${view}`;
}

function pickDefaultLegacyView(views: string[]): string {
  if (views.includes("default")) return "default";
  if (views.includes("all")) return "all";
  return views[0] ?? "default";
}

function rowSort(a: DatabaseRow, b: DatabaseRow): number {
  if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function membershipPerspectives(
  databaseId: string,
  contentDir: string,
): { viewRelationshipType: string; memberSidePerspective: string } {
  const [viewRelationshipType, memberSidePerspective] = membershipPerspectivesForSet(
    databaseId,
    contentDir,
  );
  return { viewRelationshipType, memberSidePerspective };
}

function buildCustomViewDetail(
  db: GraphDatabase,
  databaseId: string,
  databaseTitle: string,
  incoming: ReturnType<GraphDatabase["listRelationshipsToTarget"]>,
  contentDir: string,
  requestedTabId?: string,
): DatabaseViewDetail {
  const { viewRelationshipType, memberSidePerspective } = membershipPerspectives(
    databaseId,
    contentDir,
  );
  const resolved = resolveCustomTabsForNode(
    contentDir,
    databaseId,
    requestedTabId,
    viewRelationshipType,
  );
  const tabName = activeTabName(resolved);
  const ordered = isOrderedMembershipSet(databaseId, contentDir);

  const evalRows: EvalRow[] = [];
  for (const connection of incoming) {
    const page = db.getNode(connection.sourceNodeId);
    const name = page ? titleFromProperties(page.properties) : "Untitled";
    const rowIndex = ordered
      ? numericOrderValue(connection.properties[ORDERED_PROPERTY_DEFAULT], evalRows.length)
      : evalRows.length;
    evalRows.push({
      nodeId: connection.sourceNodeId,
      name,
      cells: cellsFromProperties(connection.properties),
      rowIndex,
      createdAt: page ? isoFromProperties(page.properties, "created_at") : null,
      modifiedAt: page ? isoFromProperties(page.properties, "modified_at") : null,
    });
  }

  const { rows: enrichedRows, dynamicColumnDefs, hiddenColumnKeys } = applyDynamicFields(
    db,
    databaseId,
    tabName,
    evalRows,
    undefined,
    { contentDir },
  );

  const mergedColumnDefs = buildDatabaseColumnDefs(
    db,
    databaseId,
    dynamicColumnDefs,
    hiddenColumnKeys,
    { contentDir },
  );

  hydrateRelationCellsForRows(db, databaseId, mergedColumnDefs, enrichedRows, contentDir);

  const sorted = sortEvalRowsFromViewSorts(enrichedRows, resolved.activeDefinition.sorts);

  const defaultColumns =
    mergedColumnDefs.length > 0
      ? mergedColumnDefs.map((c) => c.key)
      : [...new Set(sorted.flatMap((r) => Object.keys(r.cells)))].sort((a, b) =>
          a.localeCompare(b),
        );

  const views = loadViewsFromContent(contentDir);
  const { columns: allColumns, columnDefs: orderedColumnDefs } = applySectionColumnOrder(
    defaultColumns,
    mergedColumnDefs.length > 0 ? mergedColumnDefs : undefined,
    views,
    databaseId,
    viewRelationshipType,
  );

  const { visibleColumns } = applyHiddenColumns(
    allColumns,
    resolved.activeDefinition.hiddenColumns,
  );
  const visibleSet = new Set(visibleColumns);
  const visibleColumnDefs = orderedColumnDefs?.filter((def) => visibleSet.has(def.key));

  const rows: DatabaseRow[] = sorted.map((row, index) => ({
    rowIndex: index,
    nodeId: row.nodeId,
    name: row.name,
    cells: normalizeRowCells(row.cells, mergedColumnDefs),
    relationCells: row.relationCells,
  }));

  const tabs: TableTabsDetail = {
    kind: "custom",
    items: resolved.items,
    activeTabId: resolved.activeTabId,
    customDefinitions: resolved.definitions,
  };

  return {
    id: databaseId,
    title: databaseTitle,
    views: resolved.items.map((tab) => tab.label),
    view: tabName,
    tabs,
    viewRelationshipType,
    memberSidePerspective,
    allColumns,
    columns: visibleColumns,
    rows,
    columnDefs: visibleColumnDefs,
    allColumnDefs: orderedColumnDefs,
  };
}

function buildLegacyViewDetail(
  db: GraphDatabase,
  databaseId: string,
  databaseTitle: string,
  incoming: ReturnType<GraphDatabase["listRelationshipsToTarget"]>,
  requestedView?: string,
  contentDir?: string,
): DatabaseViewDetail {
  const connectionViews = incoming
    .map((connection) => stringProperty(connection.properties.view))
    .filter((view): view is string => view !== null);

  const views = collectLegacyViews(connectionViews);
  const view =
    requestedView && views.includes(requestedView)
      ? requestedView
      : pickDefaultLegacyView(views);

  const rowsByNodeId = new Map<string, DatabaseRow>();

  for (const connection of incoming) {
    const connectionView = stringProperty(connection.properties.view) ?? "default";
    if (connectionView !== view) continue;

    const page = db.getNode(connection.sourceNodeId);
    const name = page ? titleFromProperties(page.properties) : "Untitled";
    const cells = cellsFromProperties(connection.properties);

    rowsByNodeId.set(connection.sourceNodeId, {
      rowIndex: rowsByNodeId.size,
      nodeId: connection.sourceNodeId,
      name,
      cells,
    });
  }

  const evalRows: EvalRow[] = [...rowsByNodeId.values()].map((row) => ({
    nodeId: row.nodeId,
    name: row.name,
    cells: row.cells,
    rowIndex: row.rowIndex,
    createdAt: null,
    modifiedAt: null,
  }));

  const dir = contentDir ?? resolveContentPath();
  const { viewRelationshipType, memberSidePerspective } = membershipPerspectives(
    databaseId,
    dir,
  );
  const { rows: enrichedEvalRows, dynamicColumnDefs, hiddenColumnKeys } = applyDynamicFields(
    db,
    databaseId,
    view,
    evalRows,
    undefined,
    { contentDir: dir },
  );

  const enrichedByNodeId = new Map(enrichedEvalRows.map((r) => [r.nodeId, r]));
  for (const [nodeId, row] of rowsByNodeId) {
    const enriched = enrichedByNodeId.get(nodeId);
    if (enriched) row.cells = enriched.cells;
  }

  const columnSet = new Set<string>();
  for (const row of rowsByNodeId.values()) {
    for (const key of Object.keys(row.cells)) columnSet.add(key);
  }
  for (const col of dynamicColumnDefs) columnSet.add(col.key);
  for (const key of hiddenColumnKeys) columnSet.delete(key);

  const legacyColumnDefs: DatabaseColumnDef[] = enrichColumnDefs(
    [...columnSet].sort((a, b) => a.localeCompare(b)).map((key) => {
      const dynamic = dynamicColumnDefs.find((c) => c.key === key);
      return dynamic ?? { key, name: key, type: "text" };
    }),
  );

  const columns = legacyColumnDefs.map((c) => c.key);
  const rows = [...rowsByNodeId.values()].sort(rowSort);

  const tabItems = views.map((label) => ({
    id: label,
    label,
    kind: "custom" as const,
  }));
  const activeTabId =
    requestedView && views.includes(requestedView) ? requestedView : pickDefaultLegacyView(views);

  return {
    id: databaseId,
    title: databaseTitle,
    views,
    view,
    tabs: { kind: "custom", items: tabItems, activeTabId },
    viewRelationshipType,
    memberSidePerspective,
    allColumns: columns,
    columns,
    rows,
    columnDefs: legacyColumnDefs.length > 0 ? legacyColumnDefs : undefined,
    allColumnDefs: legacyColumnDefs.length > 0 ? legacyColumnDefs : undefined,
  };
}

/** Build a database table view from membership connections and linked page titles. */
export function getDatabaseViewDetail(
  db: GraphDatabase,
  databaseId: string,
  requestedTabId?: string,
  contentDir?: string,
): DatabaseViewDetail | null {
  const database = db.getNode(databaseId);
  const dir = contentDir ?? resolveContentPath();
  if (!database || !isTypeTableNode(db, databaseId, dir)) return null;

  const incoming = listSetMemberRowConnections(db, databaseId, dir);

  const title = titleFromProperties(database.properties);
  const views = loadViewsFromContent(dir);
  const sectionKey = viewSectionKeyForSet(databaseId, dir);
  const sectionConfig = getSectionTabsConfig(views, databaseId, sectionKey);

  if (sectionConfig?.kind === "generated") {
    return null;
  }

  if (!sectionConfig) {
    const hasLegacyViews = incoming.some((connection) =>
      Boolean(stringProperty(connection.properties.view)),
    );
    if (hasLegacyViews) {
      return buildLegacyViewDetail(db, databaseId, title, incoming, requestedTabId, dir);
    }
  }

  return buildCustomViewDetail(db, databaseId, title, incoming, dir, requestedTabId);
}
