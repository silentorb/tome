import type { Relationship } from "tome-graph-interfaces";
import {
  listSetMemberProjectionPairs,
  listSetMemberRowConnections,
} from "./set-membership";
import { isTypeTableNode } from "./node-capabilities";
import type { EvalRow } from "./row-sort";
import { applyDynamicProperties, listDynamicColumnDefs } from "./dynamic-properties";
import { hydrateRelationCellsForRows } from "./database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "./database-column-defs";
import { resolveContentPath } from "tome-flatfile";
import {
  listSetMemberRowConnectionsWindow,
  listSetMemberNodeIds,
  listSetMemberRowConnectionsForMemberIds,
  readStoreGetNode,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";
import {
  resolveCustomTabsForNode,
  activeTabName,
  getSectionTabsConfig,
  generatedProviderId,
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
  parseProjectionType,
  projectionTypeForEndpoint,
  isSymmetricAssociation,
} from "tome-flatfile";
import { perspectiveDisplayLabel } from "./association-label";
import {
  applyNameFilterAndWindow,
  buildTableRowsWindow,
  resolveWindowBounds,
} from "./table-rows-window";
import { shouldUseSqlDatabaseWindow, shouldUseSqlDatabaseSearchWindow } from "./table-sql-window";
import {
  membershipEdgesForHits,
  resolveTableSearcher,
  runTableSearchWindow,
} from "./table-search-window";
import {
  ensureDynSortIndexes,
  planDynSortIndexes,
} from "./dynamic-properties/expression-index";
import type {
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";
import type { SetMemberRelationCountSort } from "tome-service-interfaces";
import { getCompositionById } from "./table-presentation/load";
import { buildComposedDatabaseView } from "./table-presentation/compose";

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

function relationCountSortsFromColumnDefs(
  sorts: ViewSortSpec[],
  columnDefs: DatabaseColumnDef[],
  contentDir: string,
): SetMemberRelationCountSort[] {
  const registry = loadAssociationsFromContent(contentDir);
  const byKey = new Map(columnDefs.map((def) => [def.key, def]));
  const out: SetMemberRelationCountSort[] = [];
  for (const sort of sorts) {
    const def = byKey.get(sort.column);
    if (!def || def.type !== "relation" || !def.relationType?.trim()) continue;
    const projectionTypes = new Set<string>([def.relationType.trim()]);
    const parsed = parseProjectionType(def.relationType);
    if (parsed) {
      const assocDef = registry.associations[parsed.associationId];
      if (assocDef && isSymmetricAssociation(assocDef)) {
        const otherIndex: 0 | 1 = parsed.endpointIndex === 0 ? 1 : 0;
        projectionTypes.add(projectionTypeForEndpoint(parsed.associationId, otherIndex));
      }
    }
    out.push({ column: sort.column, projectionTypes: [...projectionTypes] });
  }
  return out;
}

function evalRowsFromMembershipConnections(
  store: RelationshipReadStore,
  connections: Relationship[],
  ordered: boolean,
): EvalRow[] {
  const evalRows: EvalRow[] = [];
  for (const connection of connections) {
    const page = readStoreGetNode(store, connection.sourceNodeId);
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
  return evalRows;
}

function finishCustomViewDetail(args: {
  databaseId: string;
  databaseTitle: string;
  contentDir: string;
  viewAssociation: string;
  memberSidePerspective: string;
  setSideProjection: string;
  resolved: ReturnType<typeof resolveCustomTabsForNode>;
  tabName: string;
  mergedColumnDefs: DatabaseColumnDef[];
  windowedEvalRows: EvalRow[];
  rowsWindow: DatabaseViewDetail["rowsWindow"];
}): DatabaseViewDetail {
  const {
    databaseId,
    databaseTitle,
    contentDir,
    viewAssociation,
    memberSidePerspective,
    setSideProjection,
    resolved,
    tabName,
    mergedColumnDefs,
    windowedEvalRows,
    rowsWindow,
  } = args;

  const defaultColumns =
    mergedColumnDefs.length > 0
      ? mergedColumnDefs.map((c) => c.key)
      : [...new Set(windowedEvalRows.flatMap((r) => Object.keys(r.cells)))].sort((a, b) =>
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

function buildCustomViewDetail(
  store: RelationshipReadStore,
  databaseId: string,
  databaseTitle: string,
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
  const sorts = rowsQuery?.sorts ?? resolved.activeDefinition.sorts;

  const { dynamicColumnDefs, hiddenColumnKeys } = listDynamicColumnDefs(
    store,
    databaseId,
    tabName,
    undefined,
    { contentDir },
  );
  const gateColumnDefs = buildDatabaseColumnDefs(
    store,
    databaseId,
    dynamicColumnDefs,
    hiddenColumnKeys,
    { contentDir },
  );

  if (shouldUseSqlDatabaseSearchWindow(store, rowsQuery)) {
    const projections = listSetMemberProjectionPairs(contentDir);
    const scopeIds = listSetMemberNodeIds(store, databaseId, { projections });
    const { hits, rowsWindow } = runTableSearchWindow(
      resolveTableSearcher(store),
      rowsQuery,
      new Set(scopeIds),
    );
    const hitIds = hits.map((h) => h.id);
    const relationships = membershipEdgesForHits(
      listSetMemberRowConnectionsForMemberIds(store, databaseId, projections, hitIds),
      hits,
    );
    const evalRows = evalRowsFromMembershipConnections(store, relationships, ordered);
    const {
      rows: enrichedRows,
      dynamicColumnDefs: enrichDynDefs,
      hiddenColumnKeys: enrichHidden,
    } = applyDynamicProperties(store, databaseId, tabName, evalRows, undefined, { contentDir });
    const mergedColumnDefs = buildDatabaseColumnDefs(
      store,
      databaseId,
      enrichDynDefs,
      enrichHidden,
      { contentDir },
    );
    hydrateRelationCellsForRows(store, databaseId, mergedColumnDefs, enrichedRows, contentDir);

    return finishCustomViewDetail({
      databaseId,
      databaseTitle,
      contentDir,
      viewAssociation,
      memberSidePerspective,
      setSideProjection,
      resolved,
      tabName,
      mergedColumnDefs,
      windowedEvalRows: enrichedRows,
      rowsWindow,
    });
  }

  if (shouldUseSqlDatabaseWindow(store, rowsQuery, sorts, gateColumnDefs, {
    ownerId: databaseId,
    contentDir,
  })) {
    const { offset, limit } = resolveWindowBounds(rowsQuery);
    const dynKeys = new Set(
      gateColumnDefs.filter((def) => def.source === "dynamic").map((def) => def.key),
    );
    const dynPlans = planDynSortIndexes(store, databaseId, sorts, dynKeys, contentDir) ?? [];
    const expressionIndexSorts =
      dynPlans.length > 0
        ? ensureDynSortIndexes(store, databaseId, dynPlans, contentDir)
        : undefined;
    const { relationships, total } = listSetMemberRowConnectionsWindow(store, databaseId, {
      projections: listSetMemberProjectionPairs(contentDir),
      sorts: sorts.length > 0 ? sorts : undefined,
      relationCounts: relationCountSortsFromColumnDefs(sorts, gateColumnDefs, contentDir),
      expressionIndexSorts,
      defaultOrdered: ordered,
      limit,
      offset,
    });

    const evalRows = evalRowsFromMembershipConnections(store, relationships, ordered);
    const {
      rows: enrichedRows,
      dynamicColumnDefs: enrichDynDefs,
      hiddenColumnKeys: enrichHidden,
    } = applyDynamicProperties(store, databaseId, tabName, evalRows, undefined, { contentDir });
    const mergedColumnDefs = buildDatabaseColumnDefs(
      store,
      databaseId,
      enrichDynDefs,
      enrichHidden,
      { contentDir },
    );
    hydrateRelationCellsForRows(store, databaseId, mergedColumnDefs, enrichedRows, contentDir);
    const rowsWindow = buildTableRowsWindow(offset, limit, total);

    return finishCustomViewDetail({
      databaseId,
      databaseTitle,
      contentDir,
      viewAssociation,
      memberSidePerspective,
      setSideProjection,
      resolved,
      tabName,
      mergedColumnDefs,
      windowedEvalRows: enrichedRows,
      rowsWindow,
    });
  }

  const incoming = listSetMemberRowConnections(store, databaseId, contentDir);
  const evalRows = evalRowsFromMembershipConnections(store, incoming, ordered);
  const { rows: enrichedRows, dynamicColumnDefs: enrichDynDefs, hiddenColumnKeys: enrichHidden } =
    applyDynamicProperties(store, databaseId, tabName, evalRows, undefined, { contentDir });

  const mergedColumnDefs = buildDatabaseColumnDefs(
    store,
    databaseId,
    enrichDynDefs,
    enrichHidden,
    { contentDir },
  );

  const q = rowsQuery?.q?.trim() ?? "";
  const hydrateBeforeSort = !q && sortsNeedRelationHydration(sorts, mergedColumnDefs);

  if (hydrateBeforeSort) {
    hydrateRelationCellsForRows(store, databaseId, mergedColumnDefs, enrichedRows, contentDir);
  }

  const sorted = q ? enrichedRows : sortEvalRowsFromViewSorts(enrichedRows, sorts);
  const { rows: windowedEvalRows, rowsWindow } = applyNameFilterAndWindow(
    sorted,
    rowsQuery,
    (row) => row.name,
  );

  if (!hydrateBeforeSort) {
    hydrateRelationCellsForRows(store, databaseId, mergedColumnDefs, windowedEvalRows, contentDir);
  }

  return finishCustomViewDetail({
    databaseId,
    databaseTitle,
    contentDir,
    viewAssociation,
    memberSidePerspective,
    setSideProjection,
    resolved,
    tabName,
    mergedColumnDefs,
    windowedEvalRows,
    rowsWindow,
  });
}

/** Build a database table view from set edges and linked page titles. */
export function getDatabaseViewDetail(
  store: RelationshipReadStore,
  databaseId: string,
  requestedTabId?: string,
  contentDir?: string,
  rowsQuery?: TableRowsQuery,
): DatabaseViewDetail | null {
  const database = readStoreGetNode(store, databaseId);
  const dir = contentDir ?? resolveContentPath();
  if (!database || !isTypeTableNode(store, databaseId, dir)) return null;

  const title = titleFromProperties(database.properties);
  const views = loadViewsFromContent(dir);
  const sectionKey = setRoleAssociationForNode(databaseId, dir);
  const sectionConfig = getSectionTabsConfig(views, databaseId, sectionKey);

  if (sectionConfig?.kind === "generated") {
    const provider = generatedProviderId(views, databaseId, sectionKey);
    if (!provider) return null;
    const composition = getCompositionById(provider, dir);
    if (!composition) return null;
    return buildComposedDatabaseView(store, composition, requestedTabId, dir, rowsQuery);
  }

  return buildCustomViewDetail(store, databaseId, title, dir, requestedTabId, rowsQuery);
}
