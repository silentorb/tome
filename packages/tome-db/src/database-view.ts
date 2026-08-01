import type { GraphDatabase } from "tome-sqlite";
import { listSetMemberRowConnections } from "./set-membership";
import { isTypeTableNode } from "./node-capabilities";
import type { EvalRow } from "./row-sort";
import { applyDynamicProperties } from "./dynamic-properties";
import { hydrateRelationCellsForRows } from "./database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "./database-column-defs";
import { resolveContentPath } from "tome-flatfile";
import {
  resolveCustomTabsForNode,
  activeTabName,
  getSectionTabsConfig,
} from "./views/resolve-tabs";
import { loadViewsFromContent } from "tome-flatfile";
import { sortEvalRowsFromViewSorts } from "./views/sort-spec";
import { applySectionColumnOrder, reorderColumnDefs } from "./views/column-order";
import type { TableTabsDetail } from "./views/tabs";
import { ORDER_META_KEYS, setUsesOrderedAssociation } from "./ordered-relationships";
import {
  ORDERED_PROPERTY_DEFAULT,
  setRoleAssociationForNode,
  setRoleProjectionTypesForComposite,
  loadAssociationsFromContent,
  associationIdFromTypeOrProjection,
} from "tome-flatfile";
import { perspectiveDisplayLabel } from "./association-label";
import { applyNameFilterAndWindow } from "./table-rows-window";
import type {
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";

const ROW_META_KEYS = ORDER_META_KEYS;
const DEFAULT_SET_SECTION_TITLE = "Contents";

export type {
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  RelationLink,
} from "tome-graph-interfaces";

function setSectionTitle(contentDir: string, setSidePerspective: string): string {
  const associations = loadAssociationsFromContent(contentDir);
  const composite =
    associationIdFromTypeOrProjection(associations, setSidePerspective) ?? setSidePerspective;
  const label = perspectiveDisplayLabel(associations, setSidePerspective, composite);
  return label.trim() ? label : DEFAULT_SET_SECTION_TITLE;
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

function setPerspectives(
  databaseId: string,
  contentDir: string,
): { viewAssociation: string; memberSidePerspective: string; setSideProjection: string } {
  const associationId = setRoleAssociationForNode(databaseId, contentDir);
  const registry = loadAssociationsFromContent(contentDir);
  const [setSideProjection, memberSidePerspective] = setRoleProjectionTypesForComposite(
    registry,
    associationId,
  );
  return { viewAssociation: associationId, memberSidePerspective, setSideProjection };
}

function sortsNeedRelationHydration(
  sorts: ViewSortSpec[],
  columnDefs: DatabaseColumnDef[],
): boolean {
  if (sorts.length === 0) return false;
  const relationKeys = new Set(
    columnDefs.filter((def) => def.type === "relation").map((def) => def.key),
  );
  return sorts.some((sort) => relationKeys.has(sort.column));
}

function buildCustomViewDetail(
  db: GraphDatabase,
  databaseId: string,
  databaseTitle: string,
  incoming: ReturnType<GraphDatabase["listRelationshipsToTarget"]>,
  contentDir: string,
  requestedTabId?: string,
  rowsQuery?: TableRowsQuery,
): DatabaseViewDetail {
  const { viewAssociation, memberSidePerspective, setSideProjection } = setPerspectives(
    databaseId,
    contentDir,
  );
  const resolved = resolveCustomTabsForNode(
    contentDir,
    databaseId,
    requestedTabId,
    viewAssociation,
  );
  const tabName = activeTabName(resolved);
  const ordered = setUsesOrderedAssociation(databaseId, contentDir);

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

  const { rows: enrichedRows, dynamicColumnDefs, hiddenColumnKeys } = applyDynamicProperties(
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

  const sorts = rowsQuery?.sorts ?? resolved.activeDefinition.sorts;
  const q = rowsQuery?.q?.trim() ?? "";
  const hydrateBeforeSort =
    !q && sortsNeedRelationHydration(sorts, mergedColumnDefs);

  if (hydrateBeforeSort) {
    hydrateRelationCellsForRows(db, databaseId, mergedColumnDefs, enrichedRows, contentDir);
  }

  const sorted = q ? enrichedRows : sortEvalRowsFromViewSorts(enrichedRows, sorts);

  const defaultColumns =
    mergedColumnDefs.length > 0
      ? mergedColumnDefs.map((c) => c.key)
      : [...new Set(sorted.flatMap((r) => Object.keys(r.cells)))].sort((a, b) =>
          a.localeCompare(b),
        );

  const views = loadViewsFromContent(contentDir);
  const { columns: visibleColumns, columnDefs: visibleColumnDefs } = applySectionColumnOrder(
    defaultColumns,
    mergedColumnDefs.length > 0 ? mergedColumnDefs : undefined,
    views,
    databaseId,
    viewAssociation,
    resolved.activeDefinition.properties,
  );

  const allColumnDefs =
    mergedColumnDefs.length > 0
      ? reorderColumnDefs(mergedColumnDefs, defaultColumns)
      : undefined;

  const { rows: windowedEvalRows, rowsWindow } = applyNameFilterAndWindow(
    sorted,
    rowsQuery,
    (row) => row.name,
  );

  if (!hydrateBeforeSort) {
    hydrateRelationCellsForRows(db, databaseId, mergedColumnDefs, windowedEvalRows, contentDir);
  }

  const rows: DatabaseRow[] = windowedEvalRows.map((row, index) => ({
    rowIndex: rowsWindow.offset + index,
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
    viewAssociation,
    memberSidePerspective,
    sectionTitle: setSectionTitle(contentDir, setSideProjection),
    allColumns: defaultColumns,
    columns: visibleColumns,
    rows,
    rowsWindow,
    columnDefs: visibleColumnDefs,
    allColumnDefs,
  };
}

/** Build a database table view from set edges and linked page titles. */
export function getDatabaseViewDetail(
  db: GraphDatabase,
  databaseId: string,
  requestedTabId?: string,
  contentDir?: string,
  rowsQuery?: TableRowsQuery,
): DatabaseViewDetail | null {
  const database = db.getNode(databaseId);
  const dir = contentDir ?? resolveContentPath();
  if (!database || !isTypeTableNode(db, databaseId, dir)) return null;

  const incoming = listSetMemberRowConnections(db, databaseId, dir);

  const title = titleFromProperties(database.properties);
  const views = loadViewsFromContent(dir);
  const sectionKey = setRoleAssociationForNode(databaseId, dir);
  const sectionConfig = getSectionTabsConfig(views, databaseId, sectionKey);

  if (sectionConfig?.kind === "generated") {
    return null;
  }

  return buildCustomViewDetail(
    db,
    databaseId,
    title,
    incoming,
    dir,
    requestedTabId,
    rowsQuery,
  );
}
