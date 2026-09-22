import type { RelationshipReadStore } from "../graph-store/relationship-read";
import {
  listComposedGroupHeaders,
  listComposedSetMemberRowConnectionsWindow,
  listComposedMemberNodeIds,
  listComposedSetMemberRowConnectionsForMemberIds,
  listDistinctSetMemberScopeIds,
  readStoreGetNode,
} from "../graph-store/relationship-read";
import {
  isOrderedTraitComposite,
  loadAssociationsFromContent,
  loadViewsFromContent,
  memberSideProjectionType,
  ORDERED_PROPERTY_DEFAULT,
  resolveContentPath,
  setRoleAssociationForNode,
  setRoleProjectionTypesForComposite,
  SET_TRAIT,
  typesWithTrait,
} from "tome-flatfile";
import { applyDynamicProperties } from "../dynamic-properties";
import { hydrateRelationCellsForRows, relationFieldSelectsFromColumnDefs, applyRelationFieldsToEvalRows } from "../database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "../database-column-defs";
import type { EvalRow } from "../row-sort";
import { applySectionColumnOrder } from "../views/column-order";
import { resolveGeneratedTabsFromScopes } from "../views/resolve-tabs";
import { perspectiveDisplayLabel } from "../association-label";
import {
  listSetMemberProjectionPairs,
  listSetMemberRowConnections,
} from "../set-membership";
import {
  applyNameFilterAndWindow,
  buildTableRowsWindow,
  resolveWindowBounds,
} from "../table-rows-window";
import { shouldUseSqlComposedWindow, shouldUseSqlComposedSearchWindow } from "../table-sql-window";
import {
  membershipEdgesForHits,
  resolveTableSearcher,
  runTableSearchWindow,
} from "../table-search-window";
import type {
  DatabaseRow,
  DatabaseViewDetail,
  Relationship,
  RelationScopeTab,
  TablePresentationComposition,
  TableRowsQuery,
} from "tome-graph-interfaces";
import type { SetMemberRelationFieldLink } from "tome-service-interfaces";
import { memberLinkPerspective, numericSortKey, titleFromProperties } from "./helpers";
import { discoverRelationScopes, memberMatchesScope } from "./relation-scope-tabs";
import {
  buildRelationGroups,
  buildRelationGroupsFromHeaders,
  groupsForScope,
  resolveMemberGroupId,
  windowRelationGroups,
  type GroupHeader,
} from "./relation-groups";
import { loadSemanticRelatedPathContext } from "../semantic-related-ids";

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

function orderedSetMemberProjectionTypes(contentDir: string): string[] {
  const registry = loadAssociationsFromContent(contentDir);
  return typesWithTrait(registry, SET_TRAIT)
    .filter((composite) => isOrderedTraitComposite(registry, composite))
    .map((composite) => memberSideProjectionType(registry, composite));
}

function evalRowsFromMembership(
  db: RelationshipReadStore,
  connections: Relationship[],
  reorder: boolean,
): EvalRow[] {
  const evalRows: EvalRow[] = [];
  let fallbackOrder = 0;
  for (const connection of connections) {
    const memberId = connection.sourceNodeId;
    const page = db.getNode(memberId);
    fallbackOrder += 10;
    const rowIndex = reorder
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
  if (reorder) {
    evalRows.sort((a, b) => {
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }
  return evalRows;
}

function finishComposedView(args: {
  db: RelationshipReadStore;
  composition: TablePresentationComposition;
  databaseId: string;
  databaseTitle: string;
  dir: string;
  associationId: string;
  memberSidePerspective: string;
  sectionLabel: string;
  tabs: DatabaseViewDetail["tabs"];
  activeScopeId: string | undefined;
  evalRows: EvalRow[];
  rowsWindow: DatabaseViewDetail["rowsWindow"];
  memberGroupIds?: Map<string, string | null>;
  groupHeaders?: GroupHeader[];
  /** When true, relation cells were selected in window SQL — skip TypeScript hydrate. */
  relationFieldsFromSql?: boolean;
}): DatabaseViewDetail {
  const {
    db,
    composition,
    databaseId,
    databaseTitle,
    dir,
    associationId,
    memberSidePerspective,
    sectionLabel,
    tabs,
    activeScopeId,
    evalRows,
    rowsWindow,
    memberGroupIds,
    groupHeaders,
    relationFieldsFromSql,
  } = args;

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

  if (!relationFieldsFromSql) {
    hydrateRelationCellsForRows(db, databaseId, mergedColumnDefs, enrichedRows, dir);
  }

  const windowedRows: DatabaseRow[] = enrichedRows.map((row, index) => ({
    rowIndex: rowsWindow.offset + index,
    nodeId: row.nodeId,
    name: row.name,
    cells: normalizeRowCells(row.cells, mergedColumnDefs),
    relationCells: row.relationCells,
  }));

  let groups = undefined as DatabaseViewDetail["groups"];
  if (composition.groups) {
    const includeEmpty = !rowsWindow.hasMore && rowsWindow.offset === 0;
    if (groupHeaders && memberGroupIds) {
      const fullGroups = buildRelationGroupsFromHeaders(
        groupHeaders,
        composition.groups,
        windowedRows,
        memberGroupIds,
      );
      groups = windowRelationGroups(fullGroups, windowedRows, includeEmpty);
    }
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
    title: databaseTitle,
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

function buildComposedDatabaseViewSql(
  db: RelationshipReadStore,
  composition: TablePresentationComposition,
  requestedTabId: string | undefined,
  dir: string,
  rowsQuery: TableRowsQuery | undefined,
  databaseId: string,
  databaseTitle: string,
  associationId: string,
  memberSidePerspective: string,
  sectionLabel: string,
  tableSearch = false,
): DatabaseViewDetail {
  const projections = listSetMemberProjectionPairs(dir);
  const { offset, limit } = resolveWindowBounds(rowsQuery);

  let activeScopeId: string | undefined;
  let tabs: DatabaseViewDetail["tabs"];

  if (composition.scope) {
    const scopeProjectionType = memberLinkPerspective(
      databaseId,
      composition.scope.memberToScopeComposite,
      dir,
      `table-presentation "${composition.id}" scope`,
    );
    const scopeRows = listDistinctSetMemberScopeIds(db, databaseId, {
      projections,
      scopeProjectionType,
      scopeOrderProjectionTypes: orderedSetMemberProjectionTypes(dir),
    });
    const scopes: RelationScopeTab[] = scopeRows.map((row) => ({
      id: row.id,
      name: row.title,
    }));
    tabs = resolveGeneratedTabsFromScopes(scopes, requestedTabId);
    activeScopeId = tabs.activeTabId || undefined;
  } else {
    tabs = {
      kind: "generated",
      items: [],
      activeTabId: "",
    };
  }

  const scopeFilter =
    composition.scope && activeScopeId
      ? {
          projectionType: memberLinkPerspective(
            databaseId,
            composition.scope.memberToScopeComposite,
            dir,
            `table-presentation "${composition.id}" scope`,
          ),
          scopeNodeId: activeScopeId,
        }
      : undefined;

  const groupsQuery = composition.groups
    ? {
        memberToGroupProjectionType: memberLinkPerspective(
          databaseId,
          composition.groups.memberToGroupComposite,
          dir,
          `table-presentation "${composition.id}" groups`,
        ),
        groupTypeDatabaseId: composition.groups.groupTypeDatabaseId,
        groupSetProjections: projections,
        groupToScopeProjectionType: composition.groups.groupToScopeComposite
          ? memberLinkPerspective(
              composition.groups.groupTypeDatabaseId,
              composition.groups.groupToScopeComposite,
              dir,
              `table-presentation "${composition.id}" groupToScope`,
            )
          : undefined,
        scopeNodeId: activeScopeId,
        canonicalGroupByTitle: composition.groups.canonicalGroupByTitle !== false,
      }
    : undefined;

  const excludeKeys = excludedKeys(composition);
  const gateColumnDefs = buildDatabaseColumnDefs(db, databaseId, [], new Set(), {
    excludeKeys,
    contentDir: dir,
  });
  const relationFields = relationFieldSelectsFromColumnDefs(gateColumnDefs, dir);

  const composedQuery = {
    projections,
    scope: scopeFilter,
    groups: groupsQuery,
    defaultOrdered: Boolean(composition.reorder),
    relationFields: relationFields.length > 0 ? relationFields : undefined,
    limit,
    offset,
  };

  let relationships: Relationship[];
  let groupIds: (string | null)[];
  let rowsWindow: ReturnType<typeof buildTableRowsWindow>;
  let relationFieldsByRow: Record<string, SetMemberRelationFieldLink[]>[] | undefined;

  if (tableSearch) {
    const scopeIds = listComposedMemberNodeIds(db, databaseId, composedQuery);
    const { hits, rowsWindow: searchWindow } = runTableSearchWindow(
      resolveTableSearcher(db),
      rowsQuery,
      new Set(scopeIds),
    );
    const hitIds = hits.map((h) => h.id);
    const hydrated = listComposedSetMemberRowConnectionsForMemberIds(
      db,
      databaseId,
      composedQuery,
      hitIds,
    );
    relationships = membershipEdgesForHits(hydrated.relationships, hits);
    if (groupsQuery) {
      const groupByMember = new Map<string, string | null>();
      for (let i = 0; i < hydrated.relationships.length; i++) {
        groupByMember.set(
          hydrated.relationships[i]!.sourceNodeId,
          hydrated.groupIds[i] ?? null,
        );
      }
      groupIds = relationships.map((edge) => groupByMember.get(edge.sourceNodeId) ?? null);
    } else {
      groupIds = [];
    }
    if (hydrated.relationFieldsByRow) {
      const fieldsByMember = new Map<string, Record<string, SetMemberRelationFieldLink[]>>();
      for (let i = 0; i < hydrated.relationships.length; i++) {
        fieldsByMember.set(
          hydrated.relationships[i]!.sourceNodeId,
          hydrated.relationFieldsByRow[i] ?? {},
        );
      }
      relationFieldsByRow = relationships.map(
        (edge) => fieldsByMember.get(edge.sourceNodeId) ?? {},
      );
    }
    rowsWindow = searchWindow;
  } else {
    const windowed = listComposedSetMemberRowConnectionsWindow(db, databaseId, composedQuery);
    relationships = windowed.relationships;
    groupIds = windowed.groupIds;
    relationFieldsByRow = windowed.relationFieldsByRow;
    rowsWindow = buildTableRowsWindow(offset, limit, windowed.total);
  }

  const evalRows = evalRowsFromMembership(db, relationships, false);
  applyRelationFieldsToEvalRows(evalRows, relationFieldsByRow);

  let memberGroupIds: Map<string, string | null> | undefined;
  let groupHeaders: GroupHeader[] | undefined;
  if (composition.groups && groupsQuery) {
    memberGroupIds = new Map();
    for (let i = 0; i < relationships.length; i++) {
      const edge = relationships[i]!;
      memberGroupIds.set(edge.sourceNodeId, groupIds[i] ?? null);
    }
    const headerRows = listComposedGroupHeaders(db, {
      groupTypeDatabaseId: groupsQuery.groupTypeDatabaseId,
      groupSetProjections: groupsQuery.groupSetProjections,
      groupToScopeProjectionType: groupsQuery.groupToScopeProjectionType,
      scopeNodeId: groupsQuery.scopeNodeId,
    });
    groupHeaders = headerRows.map((row) => ({
      id: row.id,
      title: row.title,
      sortKey: row.sortKey,
    }));
  }

  return finishComposedView({
    db,
    composition,
    databaseId,
    databaseTitle,
    dir,
    associationId,
    memberSidePerspective,
    sectionLabel,
    tabs,
    activeScopeId,
    evalRows,
    rowsWindow,
    memberGroupIds,
    groupHeaders,
    relationFieldsFromSql: relationFields.length > 0,
  });
}

function buildComposedDatabaseViewLegacy(
  db: RelationshipReadStore,
  composition: TablePresentationComposition,
  requestedTabId: string | undefined,
  dir: string,
  rowsQuery: TableRowsQuery | undefined,
  databaseId: string,
  databaseTitle: string,
  associationId: string,
  memberSidePerspective: string,
  sectionLabel: string,
): DatabaseViewDetail {
  const incoming = listSetMemberRowConnections(db, databaseId, dir);

  let activeScopeId: string | undefined;
  let tabs: DatabaseViewDetail["tabs"];
  const pathContext =
    composition.scope || composition.groups
      ? loadSemanticRelatedPathContext(dir)
      : undefined;

  if (composition.scope) {
    const scopes = discoverRelationScopes(
      db,
      databaseId,
      composition.scope,
      dir,
      pathContext,
    );
    tabs = resolveGeneratedTabsFromScopes(scopes, requestedTabId);
    activeScopeId = tabs.activeTabId || undefined;
  } else {
    tabs = {
      kind: "generated",
      items: [],
      activeTabId: "",
    };
  }

  const scopedConnections: Relationship[] = [];
  for (const connection of incoming) {
    const memberId = connection.sourceNodeId;
    if (
      composition.scope &&
      activeScopeId &&
      pathContext &&
      !memberMatchesScope(
        db,
        memberId,
        composition.scope,
        activeScopeId,
        databaseId,
        pathContext,
      )
    ) {
      continue;
    }
    scopedConnections.push(connection);
  }

  const evalRows = evalRowsFromMembership(db, scopedConnections, Boolean(composition.reorder));

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

  if (composition.groups && pathContext) {
    const headers = groupsForScope(
      db,
      composition.groups,
      activeScopeId,
      dir,
      pathContext,
    );
    for (const row of databaseRows) {
      memberGroupIds.set(
        row.nodeId,
        resolveMemberGroupId(
          db,
          composition.groups,
          row.nodeId,
          headers,
          databaseId,
          pathContext,
        ),
      );
    }
    groups = buildRelationGroups(
      db,
      composition.groups,
      activeScopeId,
      databaseRows,
      memberGroupIds,
      dir,
      pathContext,
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
    title: databaseTitle,
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

/**
 * Build a database Items view with optional relation-scope tabs, relation groups,
 * and reorder presentation layers.
 */
export function buildComposedDatabaseView(
  db: RelationshipReadStore,
  composition: TablePresentationComposition,
  requestedTabId?: string,
  contentDir?: string,
  rowsQuery?: TableRowsQuery,
): DatabaseViewDetail | null {
  const dir = contentDir ?? resolveContentPath();
  const database = readStoreGetNode(db, composition.typeDatabaseId);
  if (!database) return null;

  const databaseId = composition.typeDatabaseId;
  const associationId = setRoleAssociationForNode(databaseId, dir);
  const associations = loadAssociationsFromContent(dir);
  const [setSideProjection, memberSidePerspective] = setRoleProjectionTypesForComposite(
    associations,
    associationId,
  );
  const sectionLabel = perspectiveDisplayLabel(associations, setSideProjection, associationId);
  const databaseTitle = titleFromProperties(database.properties);

  if (shouldUseSqlComposedSearchWindow(db, rowsQuery)) {
    return buildComposedDatabaseViewSql(
      db,
      composition,
      requestedTabId,
      dir,
      rowsQuery,
      databaseId,
      databaseTitle,
      associationId,
      memberSidePerspective,
      sectionLabel,
      true,
    );
  }

  if (shouldUseSqlComposedWindow(db, rowsQuery)) {
    return buildComposedDatabaseViewSql(
      db,
      composition,
      requestedTabId,
      dir,
      rowsQuery,
      databaseId,
      databaseTitle,
      associationId,
      memberSidePerspective,
      sectionLabel,
    );
  }

  return buildComposedDatabaseViewLegacy(
    db,
    composition,
    requestedTabId,
    dir,
    rowsQuery,
    databaseId,
    databaseTitle,
    associationId,
    memberSidePerspective,
    sectionLabel,
  );
}
