import type { Relationship } from "tome-graph-interfaces";
import { getDatabaseViewDetail } from "./database-view";
import { coalescePriorityValue, enrichColumnDefs, isPriorityColumnKey } from "./property-enums";
import { getNodeDetail } from "./queries";
import { getNodePageMetadata } from "./node-metadata";
import { buildPropertiesSection } from "./node-type-properties";
import {
  relationSectionSupportsLinkExisting,
  associationRuleContext,
} from "./association-endpoints";
import { findTypeNodeByTitle, typeIdsForInstance } from "./node-capabilities";
import { normalizeAssociationId, parseProjectionType } from "tome-flatfile";
import { resolveContentPath } from "tome-flatfile";
import {
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "./association-label";
import { loadAssociationsFromContent } from "tome-flatfile";
import {
  isMemberSideProjectionType,
  isSetSideProjectionType,
  isSetTraitProjectionType,
  associationIdFromTypeOrProjection,
  setRoleAssociationForNode,
} from "tome-flatfile";
import { loadTableSchemasFromContent } from "tome-flatfile";
import type { TableRelationColumn } from "tome-graph-interfaces";
import { getTableSchema, relationColumns } from "tome-flatfile";
import {
  projectionTypeForRelationColumn,
  relationColumnCompositeType,
  targetTypeIdForRelationColumn,
} from "tome-flatfile";
import type {
  NodePageDetail,
  NodeSection,
  RelationRow,
  RelationTableSection,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";
import { applyNameFilterAndWindow, buildTableRowsWindow, resolveWindowBounds } from "./table-rows-window";
import {
  relationWindowSortsFromQuery,
  shouldUseSqlRelationWindow,
  shouldUseSqlRelationSearchWindow,
} from "./table-sql-window";
import {
  relationEdgesForHits,
  resolveTableSearcher,
  runTableSearchWindow,
} from "./table-search-window";
import {
  listOutgoingProjectionPropertyKeys,
  listOutgoingProjectionTypes,
  listRelationshipsFromSource,
  listRelationshipsFromSourceWindow,
  listRelatedTargetNodeIds,
  listRelationshipsFromSourceForTargetIds,
  readStoreCompositeTypeForRelationship,
  readStoreGetNode,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

export type {
  DatabaseTableSection,
  MarkdownSection,
  NodeBacklink,
  NodePageDetail,
  NodePageMetadata,
  NodeSection,
  PropertiesSection,
  RelationRow,
  RelationTableAddMode,
  RelationTableSection,
} from "tome-graph-interfaces";

const RELATION_META_KEYS = new Set([
  "ordinal",
  "row_name",
  "order",
]);

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function stringProperty(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function cellsFromConnectionProperties(properties: Record<string, unknown>): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (RELATION_META_KEYS.has(key)) continue;
    const text = stringProperty(value);
    if (text !== null) cells[key] = text;
  }
  return cells;
}

function relationTypeSortKey(
  type: string,
  registry: ReturnType<typeof loadAssociationsFromContent>,
): string {
  if (isSetTraitProjectionType(registry, type)) return "z:set";
  return `a:${type}`;
}

function ordinalFromProperties(properties: Record<string, unknown>): number {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function relationGroupKeyFromColumn(
  registry: ReturnType<typeof loadAssociationsFromContent>,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  return projectionTypeForRelationColumn(registry, hostTypeId, col);
}

function tableRelationByGroupKeyForInstance(
  db: RelationshipReadStore,
  nodeId: string,
  contentDir: string,
): Map<string, TableRelationColumn> {
  const tables = loadTableSchemasFromContent(contentDir);
  const registry = loadAssociationsFromContent(contentDir);
  const byGroupKey = new Map<string, TableRelationColumn>();
  for (const typeId of typeIdsForInstance(db, nodeId)) {
    const schema = getTableSchema(tables, typeId);
    if (!schema) continue;
    for (const col of relationColumns(schema)) {
      if (col.type !== "relation") continue;
      const key = relationGroupKeyFromColumn(registry, typeId, col);
      if (!byGroupKey.has(key)) {
        byGroupKey.set(key, col);
      }
    }
  }
  return byGroupKey;
}

function resolveTypeNodeId(
  db: RelationshipReadStore,
  association: string,
  connections: Relationship[],
  registry: ReturnType<typeof loadAssociationsFromContent>,
): string | null {
  if (isMemberSideProjectionType(registry, association)) {
    const targetIds = [...new Set(connections.map((connection) => connection.targetNodeId))];
    if (targetIds.length === 1) return targetIds[0]!;
  }

  return findTypeNodeByTitle(db, perspectiveDisplayLabel(registry, association));
}

function sectionTitleForType(
  db: RelationshipReadStore,
  label: string,
  typeNodeId: string | null,
  registry: ReturnType<typeof loadAssociationsFromContent>,
): string {
  if (typeNodeId) {
    const typeNode = readStoreGetNode(db, typeNodeId);
    if (typeNode) return titleFromProperties(typeNode.properties);
  }
  return perspectiveDisplayLabel(registry, label);
}

function typeTableIdsFromContent(contentDir: string): string[] {
  return Object.keys(loadTableSchemasFromContent(contentDir).tables);
}

function compositeTypeForRelationSection(
  db: RelationshipReadStore,
  registry: ReturnType<typeof loadAssociationsFromContent>,
  projectionType: string,
  connections: Relationship[],
  tableRelation?: TableRelationColumn,
): string {
  if (tableRelation) {
    return relationColumnCompositeType(tableRelation);
  }
  const first = connections[0];
  if (first) {
    const fromRecord = readStoreCompositeTypeForRelationship(db, first);
    if (fromRecord && registry.associations[fromRecord]) {
      const parsed = parseProjectionType(projectionType);
      if (!parsed || parsed.associationId === fromRecord) {
        return fromRecord;
      }
    }
  }
  return (
    associationIdFromTypeOrProjection(registry, projectionType) ??
    normalizeAssociationId(projectionType)
  );
}

function sortRelationRows(rows: RelationRow[], sorts: ViewSortSpec[]): void {
  rows.sort((a, b) => {
    for (const sort of sorts) {
      const left = sort.column === "name" ? a.name : (a.cells[sort.column] ?? "");
      const right = sort.column === "name" ? b.name : (b.cells[sort.column] ?? "");
      const cmp = left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
      if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function buildRelationSectionForPerspective(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  connections: Relationship[],
  options: {
    contentDir: string;
    typeTableIds: string[];
    associations: ReturnType<typeof loadAssociationsFromContent>;
    tableRelationByGroupKey: Map<string, TableRelationColumn>;
    rowsQuery?: TableRowsQuery;
    /** When set, `connections` are already ordered+windowed; skip JS sort/slice. */
    sqlWindow?: { total: number; columnKeys: string[] };
  },
): RelationTableSection | null {
  const { contentDir, typeTableIds, associations, tableRelationByGroupKey, rowsQuery, sqlWindow } =
    options;
  if (isSetSideProjectionType(associations, perspective)) return null;

  const columnSet = new Set<string>(sqlWindow?.columnKeys ?? []);
  const rows: RelationRow[] = [];

  for (const connection of connections) {
    const target = readStoreGetNode(db, connection.targetNodeId);
    const cells = cellsFromConnectionProperties(connection.properties);
    for (const key of Object.keys(cells)) columnSet.add(key);

    rows.push({
      targetId: connection.targetNodeId,
      name: target ? titleFromProperties(target.properties) : "Untitled",
      cells,
    });
  }

  if (!sqlWindow) {
    const q = rowsQuery?.q?.trim() ?? "";
    if (!q && rowsQuery?.sorts?.length) {
      sortRelationRows(rows, rowsQuery.sorts);
    } else {
      const ordinalByTarget = new Map<string, number>();
      for (const connection of connections) {
        ordinalByTarget.set(connection.targetNodeId, ordinalFromProperties(connection.properties));
      }
      rows.sort((a, b) => {
        const ordA = ordinalByTarget.get(a.targetId) ?? Number.MAX_SAFE_INTEGER;
        const ordB = ordinalByTarget.get(b.targetId) ?? Number.MAX_SAFE_INTEGER;
        if (ordA !== ordB) return ordA - ordB;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
  }

  const isSetMembership = isSetTraitProjectionType(associations, perspective);
  const typeNodeId = isSetMembership
    ? null
    : resolveTypeNodeId(db, perspective, connections, associations);
  const tableRelation = tableRelationByGroupKey.get(perspective);
  const hostTypeId = typeIdsForInstance(db, nodeId, contentDir)[0];
  const ruleContext =
    !isSetMembership && !tableRelation
      ? associationRuleContext(associations, db, nodeId, perspective, contentDir)
      : null;
  let columns = [...columnSet].sort((a, b) => a.localeCompare(b));
  if (isSetMembership) {
    for (const row of rows) {
      row.cells = {};
    }
    columns = [];
  } else if (columns.includes("priority")) {
    for (const row of rows) {
      row.cells.priority = coalescePriorityValue(row.cells.priority);
    }
  }
  const columnDefs = isSetMembership
    ? []
    : enrichColumnDefs(
        columns.map((key) => ({
          key,
          name: isPriorityColumnKey(key)
            ? "Priority"
            : key
                .split("_")
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" "),
          type: "text",
        })),
      );

  const setTraitCompositeKey =
    associationIdFromTypeOrProjection(associations, perspective) ?? perspective;
  const sectionTitle = isSetMembership
    ? perspectiveDisplayLabel(associations, perspective, setTraitCompositeKey)
    : sectionTitleForType(db, perspective, typeNodeId, associations);
  const linkAddLabel =
    isSetMembership && isMemberSideProjectionType(associations, perspective)
      ? perspectiveLinkAddLabel(
          associations,
          perspective,
          sectionTitle,
          setTraitCompositeKey,
        )
      : undefined;

  const compositeType = compositeTypeForRelationSection(
    db,
    associations,
    perspective,
    connections,
    tableRelation,
  );

  let windowedRows = rows;
  let rowsWindow;
  if (sqlWindow) {
    const { offset, limit } = resolveWindowBounds(rowsQuery);
    rowsWindow = buildTableRowsWindow(offset, limit, sqlWindow.total);
    windowedRows = rows;
  } else {
    const windowed = applyNameFilterAndWindow(rows, rowsQuery, (row) => row.name);
    windowedRows = windowed.rows;
    rowsWindow = windowed.rowsWindow;
  }

  return {
    type: "relations",
    label: perspective,
    title: sectionTitle,
    typeNodeId,
    allowedTargetTypeIds: isSetMembership
      ? typeTableIds
      : tableRelation && hostTypeId
        ? (targetTypeIdForRelationColumn(associations, hostTypeId, tableRelation)
            ? [targetTypeIdForRelationColumn(associations, hostTypeId, tableRelation)!]
            : undefined)
        : ruleContext?.allowedTargetTypeIds,
    addMode: isSetMembership
      ? "link-existing"
      : relationSectionSupportsLinkExisting(associations, perspective, compositeType)
        ? "link-existing"
        : "none",
    ...(linkAddLabel ? { linkAddLabel } : {}),
    columns,
    columnDefs,
    rows: windowedRows,
    rowsWindow,
  };
}

function loadRelationSectionConnections(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  rowsQuery: TableRowsQuery | undefined,
): {
  connections: Relationship[];
  sqlWindow?: { total: number; columnKeys: string[] };
} {
  if (shouldUseSqlRelationSearchWindow(db, rowsQuery)) {
    const scopeIds = listRelatedTargetNodeIds(db, nodeId, perspective);
    const { hits, rowsWindow } = runTableSearchWindow(
      resolveTableSearcher(db),
      rowsQuery,
      new Set(scopeIds),
    );
    const hitIds = hits.map((h) => h.id);
    const relationships = relationEdgesForHits(
      listRelationshipsFromSourceForTargetIds(db, nodeId, perspective, hitIds),
      hits,
    );
    return {
      connections: relationships,
      sqlWindow: {
        total: rowsWindow.total,
        columnKeys: listOutgoingProjectionPropertyKeys(db, nodeId, perspective),
      },
    };
  }
  if (shouldUseSqlRelationWindow(db, rowsQuery)) {
    const { offset, limit } = resolveWindowBounds(rowsQuery);
    const { relationships, total } = listRelationshipsFromSourceWindow(db, nodeId, perspective, {
      sorts: relationWindowSortsFromQuery(rowsQuery),
      limit,
      offset,
    });
    return {
      connections: relationships,
      sqlWindow: {
        total,
        columnKeys: listOutgoingProjectionPropertyKeys(db, nodeId, perspective),
      },
    };
  }
  return {
    connections: listRelationshipsFromSource(db, nodeId, perspective),
  };
}

function buildRelationSections(
  db: RelationshipReadStore,
  nodeId: string,
  options?: {
    contentDir?: string;
    includeSchemaEmptySections?: boolean;
    rowsQuery?: TableRowsQuery;
  },
): RelationTableSection[] {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const typeTableIds = typeTableIdsFromContent(contentDir);
  const associations = loadAssociationsFromContent(contentDir);
  const tableRelationByGroupKey = tableRelationByGroupKeyForInstance(db, nodeId, contentDir);
  const rowsQuery = options?.rowsQuery;

  const typeKeys = new Set<string>(listOutgoingProjectionTypes(db, nodeId));
  if (options?.includeSchemaEmptySections) {
    for (const key of tableRelationByGroupKey.keys()) {
      typeKeys.add(key);
    }
  }

  const sections: RelationTableSection[] = [];

  for (const label of [...typeKeys].sort((a, b) =>
    relationTypeSortKey(a, associations).localeCompare(relationTypeSortKey(b, associations)),
  )) {
    const { connections, sqlWindow } = loadRelationSectionConnections(
      db,
      nodeId,
      label,
      rowsQuery,
    );
    if (
      connections.length === 0 &&
      !(options?.includeSchemaEmptySections && tableRelationByGroupKey.has(label))
    ) {
      continue;
    }
    const section = buildRelationSectionForPerspective(db, nodeId, label, connections, {
      contentDir,
      typeTableIds,
      associations,
      tableRelationByGroupKey,
      rowsQuery,
      sqlWindow,
    });
    if (section) sections.push(section);
  }

  return sections;
}

/** Fetch one windowed relation table section by perspective label. */
export function getRelationTableSection(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  options?: {
    contentDir?: string;
    includeSchemaEmptySections?: boolean;
    rowsQuery?: TableRowsQuery;
  },
): RelationTableSection | null {
  const contentDir = options?.contentDir ?? resolveContentPath();
  if (!readStoreGetNode(db, nodeId)) return null;

  const associations = loadAssociationsFromContent(contentDir);
  const tableRelationByGroupKey = tableRelationByGroupKeyForInstance(db, nodeId, contentDir);
  const { connections, sqlWindow } = loadRelationSectionConnections(
    db,
    nodeId,
    perspective,
    options?.rowsQuery,
  );

  if (
    connections.length === 0 &&
    !(options?.includeSchemaEmptySections && tableRelationByGroupKey.has(perspective))
  ) {
    return null;
  }

  return buildRelationSectionForPerspective(db, nodeId, perspective, connections, {
    contentDir,
    typeTableIds: typeTableIdsFromContent(contentDir),
    associations,
    tableRelationByGroupKey,
    rowsQuery: options?.rowsQuery,
    sqlWindow,
  });
}

/** Build a universal node page view: markdown first, then database and relation table sections. */
export function getNodePageDetail(
  db: RelationshipReadStore,
  id: string,
  options?: {
    /** Active table tab id (custom or generated). */
    tabId?: string;
    /** @deprecated Use tabId */
    databaseView?: string;
    /** @deprecated Use tabId */
    scopeId?: string;
    contentDir?: string;
    /** Editor only: emit empty relation sections for type-table relation columns with no outgoing edges yet. */
    includeSchemaEmptySections?: boolean;
    /** When set, multi-row sections return a windowed first batch. */
    rows?: TableRowsQuery;
  },
): NodePageDetail | null {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const node = getNodeDetail(db, id, contentDir);
  if (!node) return null;

  const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
  const rowsQuery = options?.rows;

  const sections: NodeSection[] = [{ type: "markdown", body: node.body }];

  if (node.isTypeTable) {
    const databaseSection = getDatabaseViewDetail(
      db,
      id,
      tabId,
      contentDir,
      rowsQuery,
    );
    if (databaseSection) {
      sections.push({ type: "database", databaseView: databaseSection });
    }
  }

  sections.push(
    ...buildRelationSections(db, id, {
      contentDir,
      includeSchemaEmptySections: options?.includeSchemaEmptySections,
      rowsQuery,
    }),
  );

  const properties = node.isTypeTable ? null : buildPropertiesSection(db, id, contentDir);

  const metadata = getNodePageMetadata(db, id)!;

  return { ...node, metadata, properties, sections };
}
