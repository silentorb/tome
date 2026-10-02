import type { Relationship } from "tome-graph-interfaces";
import { getDatabaseViewDetail } from "./database-view";
import { coalescePriorityValue, enrichColumnDefs, isPriorityColumnKey } from "./property-enums";
import { getNodeDetail } from "./queries";
import { getNodePageMetadata } from "./node-metadata";
import { buildPropertiesSection } from "./node-type-properties";
import {
  relationSectionSupportsLinkExisting,
  relationshipTypeRuleContext,
} from "./relationship-type-endpoints";
import { typeIdsForInstance } from "./node-capabilities";
import { normalizeRelationshipTypeId, parseProjectionType } from "tome-flatfile";
import { resolveContentPath } from "tome-flatfile";
import {
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "./relationship-type-label";
import { loadRelationshipTypesFromContent } from "tome-flatfile";
import {
  isMemberSideProjectionType,
  isSetSideProjectionType,
  isSetTraitProjectionType,
  relationshipTypeIdFromTypeOrProjection,
  setRoleRelationshipTypeForNode,
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
import type { TomeSearchHit } from "tome-interfaces/search";
import { withProfilingSpan, withProfilingSpanAsync } from "tome-service-interfaces";
import { applyNameFilterAndWindow, buildTableRowsWindow, resolveWindowBounds } from "./table-rows-window";
import {
  explodeTableWindowRequest,
  relationWindowSortsFromQuery,
  tableWindowProfilingAttrs,
} from "./table-sql-window";
import {
  relationEdgesForHits,
  resolveTableSearcher,
  runTableSearchWindow,
} from "./table-search-window";
import {
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
  registry: ReturnType<typeof loadRelationshipTypesFromContent>,
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
  registry: ReturnType<typeof loadRelationshipTypesFromContent>,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  return projectionTypeForRelationColumn(registry, hostTypeId, col);
}

async function tableRelationByGroupKeyForInstance(
  db: RelationshipReadStore,
  nodeId: string,
  contentDir: string,
): Promise<Map<string, TableRelationColumn>> {
  const tables = loadTableSchemasFromContent(contentDir);
  const registry = loadRelationshipTypesFromContent(contentDir);
  const byGroupKey = new Map<string, TableRelationColumn>();
  for (const typeId of await typeIdsForInstance(db, nodeId)) {
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

/** Section type-table id from association/schema config only (no title scan). */
function resolveTypeNodeId(
  perspective: string,
  registry: ReturnType<typeof loadRelationshipTypesFromContent>,
  tableRelation: TableRelationColumn | undefined,
  hostTypeId: string | undefined,
): string | null {
  if (tableRelation && hostTypeId) {
    return targetTypeIdForRelationColumn(registry, hostTypeId, tableRelation);
  }
  const parsed = parseProjectionType(perspective);
  if (!parsed) return null;
  const def = registry.relationshipTypes[normalizeRelationshipTypeId(parsed.relationshipTypeId)];
  const typeId = def?.endpoints?.[parsed.endpointIndex]?.typeId;
  return typeof typeId === "string" && typeId.trim() ? typeId : null;
}

async function sectionTitleForType(
  db: RelationshipReadStore,
  label: string,
  typeNodeId: string | null,
  registry: ReturnType<typeof loadRelationshipTypesFromContent>,
): Promise<string> {
  if (typeNodeId) {
    const typeNode = await readStoreGetNode(db, typeNodeId);
    if (typeNode) return titleFromProperties(typeNode.properties);
  }
  return perspectiveDisplayLabel(registry, label);
}

function typeTableIdsFromContent(contentDir: string): string[] {
  return Object.keys(loadTableSchemasFromContent(contentDir).tables);
}

async function compositeTypeForRelationSection(
  db: RelationshipReadStore,
  registry: ReturnType<typeof loadRelationshipTypesFromContent>,
  projectionType: string,
  connections: Relationship[],
  tableRelation?: TableRelationColumn,
): Promise<string> {
  if (tableRelation) {
    return relationColumnCompositeType(tableRelation);
  }
  const first = connections[0];
  if (first) {
    const fromRecord = await readStoreCompositeTypeForRelationship(db, first);
    if (fromRecord && registry.relationshipTypes[fromRecord]) {
      const parsed = parseProjectionType(projectionType);
      if (!parsed || parsed.relationshipTypeId === fromRecord) {
        return fromRecord;
      }
    }
  }
  return (
    relationshipTypeIdFromTypeOrProjection(registry, projectionType) ??
    normalizeRelationshipTypeId(projectionType)
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

async function buildRelationSectionForPerspective(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  connections: Relationship[],
  options: {
    contentDir: string;
    typeTableIds: string[];
    relationshipTypes: ReturnType<typeof loadRelationshipTypesFromContent>;
    tableRelationByGroupKey: Map<string, TableRelationColumn>;
    rowsQuery?: TableRowsQuery;
    /** When set, `connections` are already ordered+windowed; skip JS sort/slice. */
    sqlWindow?: { total: number; columnKeys: string[] };
  },
): Promise<RelationTableSection | null> {
  const { contentDir, typeTableIds, relationshipTypes, tableRelationByGroupKey, rowsQuery, sqlWindow } =
    options;
  if (isSetSideProjectionType(relationshipTypes, perspective)) return null;

  const columnSet = new Set<string>(sqlWindow?.columnKeys ?? []);
  const rows: RelationRow[] = await withProfilingSpanAsync(
    "relation.hydrateRows",
    "INTERNAL",
    { "relation.row_count": connections.length },
    async () => {
      const built: RelationRow[] = [];
      for (const connection of connections) {
        const target = await readStoreGetNode(db, connection.targetNodeId);
        const cells = cellsFromConnectionProperties(connection.properties);
        for (const key of Object.keys(cells)) columnSet.add(key);

        built.push({
          targetId: connection.targetNodeId,
          name: target ? titleFromProperties(target.properties) : "Untitled",
          cells,
        });
      }
      return built;
    },
  );

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
        return a.targetId.localeCompare(b.targetId);
      });
    }
  }

  const isSetMembership = isSetTraitProjectionType(relationshipTypes, perspective);
  const tableRelation = tableRelationByGroupKey.get(perspective);
  const hostTypeIds = await typeIdsForInstance(db, nodeId, contentDir);
  const hostTypeId = hostTypeIds[0];
  const typeNodeId = isSetMembership
    ? null
    : resolveTypeNodeId(perspective, relationshipTypes, tableRelation, hostTypeId);
  const ruleContext =
    !isSetMembership && !tableRelation
      ? await relationshipTypeRuleContext(relationshipTypes, db, nodeId, perspective, contentDir)
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
    relationshipTypeIdFromTypeOrProjection(relationshipTypes, perspective) ?? perspective;
  const sectionTitle = isSetMembership
    ? perspectiveDisplayLabel(relationshipTypes, perspective, setTraitCompositeKey)
    : await sectionTitleForType(db, perspective, typeNodeId, relationshipTypes);
  const linkAddLabel =
    isSetMembership && isMemberSideProjectionType(relationshipTypes, perspective)
      ? perspectiveLinkAddLabel(
          relationshipTypes,
          perspective,
          sectionTitle,
          setTraitCompositeKey,
        )
      : undefined;

  const compositeType = await compositeTypeForRelationSection(
    db,
    relationshipTypes,
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
        ? (targetTypeIdForRelationColumn(relationshipTypes, hostTypeId, tableRelation)
            ? [targetTypeIdForRelationColumn(relationshipTypes, hostTypeId, tableRelation)!]
            : undefined)
        : ruleContext?.allowedTargetTypeIds,
    addMode: isSetMembership
      ? "link-existing"
      : relationSectionSupportsLinkExisting(relationshipTypes, perspective, compositeType)
        ? "link-existing"
        : "none",
    ...(linkAddLabel ? { linkAddLabel } : {}),
    columns,
    columnDefs,
    rows: windowedRows,
    rowsWindow,
  };
}

/**
 * Uniform relation window: optional prior searcher query → window → connections.
 * Search is an operator (feeds hit ids), not a peer window backend.
 */
async function loadRelationSectionConnections(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  rowsQuery: TableRowsQuery | undefined,
): Promise<{
  connections: Relationship[];
  sqlWindow?: { total: number; columnKeys: string[] };
  plan: ReturnType<typeof explodeTableWindowRequest>;
}> {
  const plan = explodeTableWindowRequest(db, rowsQuery);
  const windowAttrs = tableWindowProfilingAttrs(plan);

  if (plan.backend === "js") {
    return {
      connections: await listRelationshipsFromSource(db, nodeId, perspective),
      plan,
    };
  }

  let searchHits:
    | { hits: TomeSearchHit[]; total: number }
    | undefined;
  if (plan.searchQuery) {
    const scopeIds = await withProfilingSpanAsync(
      "table.search.scopeIds",
      "INTERNAL",
      windowAttrs,
      () => listRelatedTargetNodeIds(db, nodeId, perspective),
    );
    const { hits, rowsWindow } = await runTableSearchWindow(
      resolveTableSearcher(db),
      rowsQuery,
      new Set(scopeIds),
      windowAttrs,
    );
    searchHits = { hits, total: rowsWindow.total };
  }

  if (searchHits) {
    const hitIds = searchHits.hits.map((h) => h.id);
    const relationships = relationEdgesForHits(
      await listRelationshipsFromSourceForTargetIds(db, nodeId, perspective, hitIds),
      searchHits.hits,
    );
    return {
      connections: relationships,
      sqlWindow: {
        total: searchHits.total,
        columnKeys: [],
      },
      plan,
    };
  }

  const { relationships, total } = await listRelationshipsFromSourceWindow(db, nodeId, perspective, {
    sorts: relationWindowSortsFromQuery(rowsQuery),
    limit: plan.limit,
    offset: plan.offset,
  });
  return {
    connections: relationships,
    sqlWindow: {
      total,
      columnKeys: [],
    },
    plan,
  };
}

async function buildRelationSections(
  db: RelationshipReadStore,
  nodeId: string,
  options?: {
    contentDir?: string;
    includeSchemaEmptySections?: boolean;
    rowsQuery?: TableRowsQuery;
  },
): Promise<RelationTableSection[]> {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const typeTableIds = typeTableIdsFromContent(contentDir);
  const relationshipTypes = loadRelationshipTypesFromContent(contentDir);
  const tableRelationByGroupKey = await tableRelationByGroupKeyForInstance(db, nodeId, contentDir);
  const rowsQuery = options?.rowsQuery;

  const typeKeys = new Set<string>(await listOutgoingProjectionTypes(db, nodeId));
  if (options?.includeSchemaEmptySections) {
    for (const key of tableRelationByGroupKey.keys()) {
      typeKeys.add(key);
    }
  }

  const sections: RelationTableSection[] = [];

  for (const label of [...typeKeys].sort((a, b) =>
    relationTypeSortKey(a, relationshipTypes).localeCompare(relationTypeSortKey(b, relationshipTypes)),
  )) {
    const { connections, sqlWindow } = await loadRelationSectionConnections(
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
    const section = await buildRelationSectionForPerspective(db, nodeId, label, connections, {
      contentDir,
      typeTableIds,
      relationshipTypes,
      tableRelationByGroupKey,
      rowsQuery,
      sqlWindow,
    });
    if (section) sections.push(section);
  }

  return sections;
}

/** Fetch one windowed relation table section by perspective label. */
export async function getRelationTableSection(
  db: RelationshipReadStore,
  nodeId: string,
  perspective: string,
  options?: {
    contentDir?: string;
    includeSchemaEmptySections?: boolean;
    rowsQuery?: TableRowsQuery;
  },
): Promise<RelationTableSection | null> {
  const run = async (): Promise<RelationTableSection | null> => {
    const contentDir = options?.contentDir ?? resolveContentPath();
    if (!await readStoreGetNode(db, nodeId)) return null;

    const relationshipTypes = loadRelationshipTypesFromContent(contentDir);
    const tableRelationByGroupKey = await tableRelationByGroupKeyForInstance(db, nodeId, contentDir);
    const plan = explodeTableWindowRequest(db, options?.rowsQuery);
    const { connections, sqlWindow } = await withProfilingSpanAsync(
      "relation.loadConnections",
      "INTERNAL",
      tableWindowProfilingAttrs(plan),
      () => loadRelationSectionConnections(db, nodeId, perspective, options?.rowsQuery),
    );

    if (
      connections.length === 0 &&
      !(options?.includeSchemaEmptySections && tableRelationByGroupKey.has(perspective))
    ) {
      return null;
    }

    return withProfilingSpanAsync(
      "relation.buildSection",
      "INTERNAL",
      { "relation.row_count": connections.length },
      () =>
        buildRelationSectionForPerspective(db, nodeId, perspective, connections, {
          contentDir,
          typeTableIds: typeTableIdsFromContent(contentDir),
          relationshipTypes,
          tableRelationByGroupKey,
          rowsQuery: options?.rowsQuery,
          sqlWindow,
        }),
    );
  };

  return withProfilingSpanAsync("getRelationTableSection", "INTERNAL", {}, run);
}

/** Build a universal node page view: markdown first, then database and relation table sections. */
export async function getNodePageDetail(
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
): Promise<NodePageDetail | null> {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const node = await getNodeDetail(db, id, contentDir);
  if (!node) return null;

  const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
  const rowsQuery = options?.rows;

  const sections: NodeSection[] = [{ type: "markdown", body: node.body }];

  if (node.isTypeTable) {
    const databaseSection = await getDatabaseViewDetail(
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
    ...(await buildRelationSections(db, id, {
      contentDir,
      includeSchemaEmptySections: options?.includeSchemaEmptySections,
      rowsQuery,
    })),
  );

  const properties = node.isTypeTable ? null : await buildPropertiesSection(db, id, contentDir);

  const metadata = (await getNodePageMetadata(db, id))!;

  return { ...node, metadata, properties, sections };
}
