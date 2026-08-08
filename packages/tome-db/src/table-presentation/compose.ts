import type { GraphDatabase } from "tome-sqlite";
import {
  loadAssociationsFromContent,
  loadViewsFromContent,
  ORDERED_PROPERTY_DEFAULT,
  resolveContentPath,
  setRoleAssociationForNode,
  setRoleProjectionTypesForComposite,
} from "tome-flatfile";
import { applyDynamicProperties } from "../dynamic-properties";
import { hydrateRelationCellsForRows } from "../database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "../database-column-defs";
import type { EvalRow } from "../row-sort";
import { applySectionColumnOrder } from "../views/column-order";
import { resolveGeneratedTabsFromScopes } from "../views/resolve-tabs";
import { perspectiveDisplayLabel } from "../association-label";
import { listSetMemberRowConnections } from "../set-membership";
import { applyNameFilterAndWindow } from "../table-rows-window";
import type {
  DatabaseRow,
  DatabaseViewDetail,
  TablePresentationComposition,
  TableRowsQuery,
} from "tome-graph-interfaces";
import { memberLinkPerspective, numericSortKey, titleFromProperties } from "./helpers";
import { discoverRelationScopes, memberMatchesScope } from "./relation-scope-tabs";
import {
  buildRelationGroups,
  groupsForScope,
  resolveMemberGroupId,
  windowRelationGroups,
} from "./relation-groups";

function stringProperty(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function cellsFromProperties(properties: Record<string, unknown>): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === ORDERED_PROPERTY_DEFAULT || key === "ordinal" || key === "row_name") continue;
    const text = stringProperty(value);
    if (text !== null) cells[key] = text;
  }
  return cells;
}

function excludedKeys(composition: TablePresentationComposition): Set<string> {
  const keys = new Set<string>(composition.excludeColumnKeys ?? []);
  for (const key of composition.scope?.excludeColumnKeys ?? []) keys.add(key);
  for (const key of composition.groups?.excludeColumnKeys ?? []) keys.add(key);
  for (const key of composition.reorder?.excludeColumnKeys ?? []) keys.add(key);
  return keys;
}

/**
 * Build a database Items view with optional relation-scope tabs, relation groups,
 * and reorder presentation layers.
 */
export function buildComposedDatabaseView(
  db: GraphDatabase,
  composition: TablePresentationComposition,
  requestedTabId?: string,
  contentDir?: string,
  rowsQuery?: TableRowsQuery,
): DatabaseViewDetail | null {
  const dir = contentDir ?? resolveContentPath();
  const database = db.getNode(composition.typeDatabaseId);
  if (!database) return null;

  const databaseId = composition.typeDatabaseId;
  const associationId = setRoleAssociationForNode(databaseId, dir);
  const associations = loadAssociationsFromContent(dir);
  const [setSideProjection, memberSidePerspective] = setRoleProjectionTypesForComposite(
    associations,
    associationId,
  );
  const sectionLabel = perspectiveDisplayLabel(associations, setSideProjection, associationId);

  const incoming = listSetMemberRowConnections(db, databaseId, dir);

  let activeScopeId: string | undefined;
  let tabs: DatabaseViewDetail["tabs"];

  if (composition.scope) {
    const scopes = discoverRelationScopes(db, databaseId, composition.scope, dir);
    tabs = resolveGeneratedTabsFromScopes(scopes, requestedTabId);
    activeScopeId = tabs.activeTabId || undefined;
  } else {
    tabs = {
      kind: "generated",
      items: [],
      activeTabId: "",
    };
  }

  const evalRows: EvalRow[] = [];
  let fallbackOrder = 0;
  for (const connection of incoming) {
    const memberId = connection.sourceNodeId;
    if (
      composition.scope &&
      activeScopeId &&
      !memberMatchesScope(db, memberId, composition.scope, activeScopeId)
    ) {
      continue;
    }

    const page = db.getNode(memberId);
    fallbackOrder += 10;
    const rowIndex = composition.reorder
      ? numericSortKey(connection.properties[ORDERED_PROPERTY_DEFAULT], fallbackOrder)
      : evalRows.length;

    evalRows.push({
      nodeId: memberId,
      name: page ? titleFromProperties(page.properties) : "Untitled",
      cells: cellsFromProperties(connection.properties),
      rowIndex,
      createdAt: null,
      modifiedAt: null,
    });
  }

  if (composition.reorder) {
    evalRows.sort((a, b) => {
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  const { rows: enrichedRows, dynamicColumnDefs, hiddenColumnKeys } = applyDynamicProperties(
    db,
    databaseId,
    "default",
    evalRows,
    undefined,
    { contentDir: dir },
  );

  const excludeKeys = excludedKeys(composition);
  const mergedColumnDefs = buildDatabaseColumnDefs(
    db,
    databaseId,
    dynamicColumnDefs,
    hiddenColumnKeys,
    { excludeKeys, contentDir: dir },
  );

  const defaultColumns =
    mergedColumnDefs.length > 0
      ? mergedColumnDefs.map((col) => col.key)
      : [...new Set(enrichedRows.flatMap((r) => Object.keys(r.cells)))].sort((a, b) =>
          a.localeCompare(b),
        );

  const views = loadViewsFromContent(dir);
  const { columns, columnDefs } = applySectionColumnOrder(
    defaultColumns,
    mergedColumnDefs.length > 0 ? mergedColumnDefs : undefined,
    views,
    databaseId,
    associationId,
  );

  const databaseRows: DatabaseRow[] = enrichedRows.map((row, index) => ({
    rowIndex: index,
    nodeId: row.nodeId,
    name: row.name,
    cells: normalizeRowCells(row.cells, mergedColumnDefs),
  }));

  let groups = undefined as DatabaseViewDetail["groups"];
  let memberGroupIds = new Map<string, string | null>();

  if (composition.groups) {
    const headers = groupsForScope(db, composition.groups, activeScopeId, dir);
    for (const row of databaseRows) {
      memberGroupIds.set(
        row.nodeId,
        resolveMemberGroupId(db, composition.groups, row.nodeId, headers),
      );
    }
    groups = buildRelationGroups(
      db,
      composition.groups,
      activeScopeId,
      databaseRows,
      memberGroupIds,
      dir,
    );
  }

  type FlatNamed = DatabaseRow & { groupId?: string; groupTitle?: string };
  const flatForWindow: FlatNamed[] = [];
  if (groups) {
    for (const group of groups) {
      for (const row of group.rows) {
        flatForWindow.push({ ...row, groupId: group.groupId, groupTitle: group.title });
      }
    }
  } else {
    flatForWindow.push(...databaseRows);
  }

  const { rows: windowedFlat, rowsWindow } = applyNameFilterAndWindow(
    flatForWindow,
    rowsQuery,
    (row) => row.name,
  );

  const windowEvalRows: EvalRow[] = windowedFlat.map((row) => ({
    nodeId: row.nodeId,
    name: row.name,
    cells: row.cells,
    rowIndex: row.rowIndex,
    createdAt: null,
    modifiedAt: null,
  }));
  hydrateRelationCellsForRows(db, databaseId, mergedColumnDefs, windowEvalRows, dir);
  const hydratedById = new Map(windowEvalRows.map((row) => [row.nodeId, row]));

  const windowedRows: DatabaseRow[] = windowedFlat.map((row, index) => {
    const hydrated = hydratedById.get(row.nodeId);
    return {
      rowIndex: rowsWindow.offset + index,
      nodeId: row.nodeId,
      name: row.name,
      cells: hydrated
        ? normalizeRowCells(hydrated.cells, mergedColumnDefs)
        : row.cells,
      relationCells: hydrated?.relationCells,
    };
  });

  if (groups) {
    const includeEmpty = !rowsWindow.hasMore && rowsWindow.offset === 0;
    groups = windowRelationGroups(groups, windowedRows, includeEmpty);
  }

  const presentation: DatabaseViewDetail["presentation"] = {
    compositionId: composition.id,
    scopeId: activeScopeId,
    reorderable: Boolean(composition.reorder),
  };
  if (composition.scope) {
    presentation.scopeRelationType = memberLinkPerspective(
      databaseId,
      composition.scope.memberToScopeComposite,
      dir,
      `table-presentation "${composition.id}" scope`,
    );
  }
  if (composition.groups) {
    presentation.groupCompositeType = composition.groups.memberToGroupComposite;
    presentation.groupRelationType = memberLinkPerspective(
      databaseId,
      composition.groups.memberToGroupComposite,
      dir,
      `table-presentation "${composition.id}" groups`,
    );
  }

  const activeLabel =
    tabs.items.find((item) => item.id === tabs.activeTabId)?.label ?? tabs.activeTabId;

  return {
    id: databaseId,
    title: titleFromProperties(database.properties),
    views: tabs.items.map((item) => item.label),
    view: activeLabel || "default",
    tabs,
    viewAssociation: associationId,
    memberSidePerspective,
    sectionTitle: sectionLabel.trim() ? sectionLabel : "Contents",
    allColumns: defaultColumns,
    columns,
    rows: windowedRows,
    rowsWindow,
    columnDefs,
    allColumnDefs: mergedColumnDefs.length > 0 ? mergedColumnDefs : undefined,
    groups,
    presentation,
  };
}
