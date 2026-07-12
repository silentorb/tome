import type { GraphDatabase, Relationship } from "tome-sqlite";
import { getDatabaseViewDetail } from "./database-view";
import { coalescePriorityValue, enrichColumnDefs, isPriorityColumnKey } from "./property-enums";
import {
  getConfigByProvider,
  getOrderedCollectionView,
} from "./ordered-collections";
import { getNodeDetail } from "./queries";
import { getNodePageMetadata } from "./node-metadata";
import { buildPropertiesSection } from "./node-type-properties";
import {
  relationSectionSupportsLinkExisting,
  associationRuleContext,
} from "./association-endpoints";
import { findTypeNodeByTitle, typeIdsForInstance } from "./node-capabilities";
import { normalizeRelationshipType } from "tome-flatfile";
import { resolveContentPath } from "tome-flatfile";
import { resolveAssociationId } from "tome-flatfile";
import {
  formatAssociationLabel,
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "./association-label";
import { loadAssociationsFromContent } from "tome-flatfile";
import {
  isMemberSidePerspective,
  isSetSidePerspective,
  isSetTraitPerspective,
  resolveSetTraitComposite,
  setRolePerspectivesForNode,
} from "tome-flatfile";
import { generatedProviderId } from "./views/resolve-tabs";
import { loadViewsFromContent } from "tome-flatfile";
import { loadTableSchemasFromContent } from "tome-flatfile";
import type { TableRelationColumn } from "tome-flatfile";
import { getTableSchema, relationColumns } from "tome-flatfile";
import {
  perspectiveForRelationColumn,
  relationColumnCompositeType,
  targetTypeIdForRelationColumn,
} from "tome-flatfile";
import type {
  NodePageDetail,
  NodeSection,
  RelationRow,
  RelationTableSection,
} from "tome-graph-interfaces";

export type {
  DatabaseTableSection,
  MarkdownSection,
  NodeBacklink,
  NodePageDetail,
  NodePageMetadata,
  NodeSection,
  OrderedCollectionSection,
  PropertiesSection,
  RelationRow,
  RelationTableAddMode,
  RelationTableSection,
} from "tome-graph-interfaces";

const RELATION_META_KEYS = new Set([
  "ordinal",
  "via_view",
  "view",
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
  if (isSetTraitPerspective(registry, type)) return "z:set";
  return `a:${type}`;
}

function ordinalFromProperties(properties: Record<string, unknown>): number {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function relationGroupKey(connection: { type: string }): string {
  return connection.type;
}

/** Group key for a table-schemas relation column; aligns with {@link relationGroupKey}. */
function relationGroupKeyFromColumn(
  registry: ReturnType<typeof loadAssociationsFromContent>,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  return perspectiveForRelationColumn(registry, hostTypeId, col);
}

function tableRelationByGroupKeyForInstance(
  db: GraphDatabase,
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
  db: GraphDatabase,
  association: string,
  connections: Relationship[],
  registry: ReturnType<typeof loadAssociationsFromContent>,
): string | null {
  if (isMemberSidePerspective(registry, association)) {
    const targetIds = [...new Set(connections.map((connection) => connection.targetNodeId))];
    if (targetIds.length === 1) return targetIds[0]!;
  }

  return findTypeNodeByTitle(db, formatAssociationLabel(association));
}

function sectionTitleForType(
  db: GraphDatabase,
  label: string,
  typeNodeId: string | null,
): string {
  if (typeNodeId) {
    const typeNode = db.getNode(typeNodeId);
    if (typeNode) return titleFromProperties(typeNode.properties);
  }
  return formatAssociationLabel(label);
}

function typeTableIdsFromContent(contentDir: string): string[] {
  return Object.keys(loadTableSchemasFromContent(contentDir).tables);
}

function compositeTypeForRelationSection(
  db: GraphDatabase,
  registry: ReturnType<typeof loadAssociationsFromContent>,
  perspective: string,
  connections: Relationship[],
  tableRelation?: TableRelationColumn,
): string {
  if (tableRelation) {
    return relationColumnCompositeType(tableRelation);
  }
  const first = connections[0];
  if (first?.recordId) {
    const record = db.getRelationshipRecord(first.recordId);
    if (record?.compositeType) {
      const fromRecord = normalizeRelationshipType(record.compositeType);
      const def = registry.associations[fromRecord];
      if (def?.perspectives.includes(normalizeRelationshipType(perspective))) {
        return fromRecord;
      }
    }
  }
  return resolveAssociationId(registry, perspective);
}

function buildRelationSections(
  db: GraphDatabase,
  nodeId: string,
  options?: {
    contentDir?: string;
    includeSchemaEmptySections?: boolean;
  },
): RelationTableSection[] {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const typeTableIds = typeTableIdsFromContent(contentDir);
  const associations = loadAssociationsFromContent(contentDir);
  const outgoing = db.listRelationshipsFromSource(nodeId);
  const byType = new Map<string, typeof outgoing>();
  const tableRelationByGroupKey = tableRelationByGroupKeyForInstance(db, nodeId, contentDir);

  for (const connection of outgoing) {
    const groupType = relationGroupKey(connection);
    const group = byType.get(groupType) ?? [];
    group.push(connection);
    byType.set(groupType, group);
  }

  if (options?.includeSchemaEmptySections) {
    for (const key of tableRelationByGroupKey.keys()) {
      if (!byType.has(key)) {
        byType.set(key, []);
      }
    }
  }

  const sections: RelationTableSection[] = [];

  for (const label of [...byType.keys()].sort((a, b) =>
    relationTypeSortKey(a, associations).localeCompare(relationTypeSortKey(b, associations)),
  )) {
    const perspective = label;
    if (isSetSidePerspective(associations, perspective)) continue;

    const connections = byType.get(label)!;
    const columnSet = new Set<string>();
    const rows: RelationRow[] = [];

    for (const connection of connections) {
      const target = db.getNode(connection.targetNodeId);
      const cells = cellsFromConnectionProperties(connection.properties);
      for (const key of Object.keys(cells)) columnSet.add(key);

      rows.push({
        targetId: connection.targetNodeId,
        name: target ? titleFromProperties(target.properties) : "Untitled",
        cells,
      });
    }

    rows.sort((a, b) => {
      const connA = connections.find((connection) => connection.targetNodeId === a.targetId);
      const connB = connections.find((connection) => connection.targetNodeId === b.targetId);
      const ordA = connA ? ordinalFromProperties(connA.properties) : Number.MAX_SAFE_INTEGER;
      const ordB = connB ? ordinalFromProperties(connB.properties) : Number.MAX_SAFE_INTEGER;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    const isSetMembership = isSetTraitPerspective(associations, perspective);
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
      resolveSetTraitComposite(associations, perspective) ?? perspective;
    const sectionTitle = isSetMembership
      ? perspectiveDisplayLabel(associations, perspective, setTraitCompositeKey)
      : sectionTitleForType(db, perspective, typeNodeId);
    const linkAddLabel =
      isSetMembership && isMemberSidePerspective(associations, perspective)
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

    sections.push({
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
      rows,
    });
  }

  return sections;
}

/** Build a universal node page view: markdown first, then database and relation table sections. */
export function getNodePageDetail(
  db: GraphDatabase,
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
  },
): NodePageDetail | null {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const node = getNodeDetail(db, id, contentDir);
  if (!node) return null;

  const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
  const views = loadViewsFromContent(contentDir);

  const sections: NodeSection[] = [{ type: "markdown", body: node.body }];

  if (node.isTypeTable) {
    const sectionKey = setRolePerspectivesForNode(id, contentDir)[0];
    const provider = generatedProviderId(views, id, sectionKey);
    if (provider) {
      const config = getConfigByProvider(provider, contentDir);
      if (config) {
        const orderedView = getOrderedCollectionView(db, config.id, tabId, contentDir);
        if (orderedView) {
          sections.push({
            type: "ordered-collection",
            configId: config.id,
            view: orderedView,
          });
        }
      }
    } else {
      const databaseSection = getDatabaseViewDetail(db, id, tabId, contentDir);
      if (databaseSection) {
        sections.push({ type: "database", databaseView: databaseSection });
      }
    }
  }

  sections.push(
    ...buildRelationSections(db, id, {
      contentDir,
      includeSchemaEmptySections: options?.includeSchemaEmptySections,
    }),
  );

  const properties = node.isTypeTable ? null : buildPropertiesSection(db, id, contentDir);

  const metadata = getNodePageMetadata(db, id)!;

  return { ...node, metadata, properties, sections };
}
