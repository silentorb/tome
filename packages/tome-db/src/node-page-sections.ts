import type { GraphDatabase, Relationship } from "./graph";
import { getDatabaseViewDetail, type DatabaseColumnDef, type DatabaseViewDetail } from "./database-view";
import { coalescePriorityValue, enrichColumnDefs, isPriorityColumnKey } from "./property-enums";
import { IS_A_TYPE, isTypeMembershipType } from "./labels";
import {
  getConfigByProvider,
  getOrderedAssociationView,
  type OrderedAssociationViewDetail,
} from "./ordered-associations";
import { getNodeDetail, type NodeDetail } from "./queries";
import { getNodePageMetadata, type NodePageMetadata } from "./node-metadata";
import { buildPropertiesSection, type PropertiesSection } from "./node-type-properties";
import { INCLUDES_TYPE, relationSectionSupportsLinkExisting } from "./includes-relationship";
import { findTypeNodeByTitle, typeIdsForInstance } from "./node-capabilities";
import { normalizeRelationshipType } from "./relation-type";
import { relationshipRuleContextForType } from "./schema-rules/resolve";
import type { SchemaFile } from "./schema-rules/schema-file";
import { resolveContentPath } from "./content/paths";
import { formatRelationshipTypeLabel } from "./relationship-type-label";
import { generatedProviderId, ITEMS_SECTION_KEY } from "./views/resolve-tabs";
import { loadViewsFromContent } from "./views/load";
import { loadTableSchemasFromContent } from "./table-schemas/load";

const RELATION_META_KEYS = new Set([
  "ordinal",
  "via_view",
  "view",
  "row_index",
  "row_name",
]);

export interface MarkdownSection {
  type: "markdown";
  body: string;
}

export interface DatabaseTableSection {
  type: "database";
  databaseView: DatabaseViewDetail;
}

export interface OrderedAssociationSection {
  type: "ordered-association";
  configId: string;
  view: OrderedAssociationViewDetail;
}

export interface RelationRow {
  targetId: string;
  name: string;
  cells: Record<string, string>;
}

export type RelationTableAddMode = "link-existing" | "none";

export interface RelationTableSection {
  type: "relations";
  label: string;
  title: string;
  /** When set, the section title links to this type node. */
  typeNodeId: string | null;
  /** UI hint: allowed IS_A target type ids for link-existing picker (from schema.json). */
  allowedTargetTypeIds?: string[];
  /** Inline table add control: link existing record vs none (structural one-to-many). */
  addMode: RelationTableAddMode;
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
  rows: RelationRow[];
}

export type NodeSection = MarkdownSection | DatabaseTableSection | OrderedAssociationSection | RelationTableSection;

export interface NodePageDetail extends NodeDetail {
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  sections: NodeSection[];
}

export type { PropertiesSection } from "./node-type-properties";

export type { NodeBacklink, NodePageMetadata } from "./node-metadata";

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

function relationTypeSortKey(type: string): string {
  if (isTypeMembershipType(type)) return "z:is_a";
  return `a:${type}`;
}

function ordinalFromProperties(properties: Record<string, unknown>): number {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function relationGroupKey(
  db: GraphDatabase,
  connection: { type: string; targetNodeId: string },
): string {
  if (normalizeRelationshipType(connection.type) !== INCLUDES_TYPE) return connection.type;
  const targetTypes = typeIdsForInstance(db, connection.targetNodeId);
  if (targetTypes.length === 1) return `${INCLUDES_TYPE}:${targetTypes[0]}`;
  return INCLUDES_TYPE;
}

function parseIncludesGroupKey(label: string): { typeNodeId: string | null; perspective: string } {
  if (!label.startsWith(`${INCLUDES_TYPE}:`)) {
    return { typeNodeId: null, perspective: label };
  }
  return { typeNodeId: label.slice(INCLUDES_TYPE.length + 1), perspective: INCLUDES_TYPE };
}

function resolveTypeNodeId(
  db: GraphDatabase,
  relationshipType: string,
  connections: Relationship[],
): string | null {
  if (relationshipType === IS_A_TYPE) {
    const targetIds = [...new Set(connections.map((connection) => connection.targetNodeId))];
    if (targetIds.length === 1) return targetIds[0]!;
  }

  return findTypeNodeByTitle(db, formatRelationshipTypeLabel(relationshipType));
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
  return formatRelationshipTypeLabel(label);
}

function typeTableIdsFromContent(contentDir: string): string[] {
  return Object.keys(loadTableSchemasFromContent(contentDir).tables);
}

function buildRelationSections(
  db: GraphDatabase,
  nodeId: string,
  options?: { schema?: SchemaFile; contentDir?: string },
): RelationTableSection[] {
  const schema = options?.schema;
  const contentDir = options?.contentDir ?? resolveContentPath();
  const typeTableIds = typeTableIdsFromContent(contentDir);
  const outgoing = db.listRelationshipsFromSource(nodeId);
  const byType = new Map<string, typeof outgoing>();

  for (const connection of outgoing) {
    const groupType = relationGroupKey(db, connection);
    const group = byType.get(groupType) ?? [];
    group.push(connection);
    byType.set(groupType, group);
  }

  const sections: RelationTableSection[] = [];

  for (const label of [...byType.keys()].sort((a, b) =>
    relationTypeSortKey(a).localeCompare(relationTypeSortKey(b)),
  )) {
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

    const { typeNodeId: includesTypeId, perspective } = parseIncludesGroupKey(label);
    const typeNodeId =
      includesTypeId ?? resolveTypeNodeId(db, perspective, connections);
    const ruleContext =
      schema && !isTypeMembershipType(perspective)
        ? relationshipRuleContextForType(schema, db, nodeId, perspective)
        : null;
    const isTypeMembership = isTypeMembershipType(perspective);
    let columns = [...columnSet].sort((a, b) => a.localeCompare(b));
    if (isTypeMembership) {
      for (const row of rows) {
        row.cells = {};
      }
      columns = [];
    } else if (columns.includes("priority")) {
      for (const row of rows) {
        row.cells.priority = coalescePriorityValue(row.cells.priority);
      }
    }
    const columnDefs = isTypeMembership
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

    sections.push({
      type: "relations",
      label: perspective,
      title: sectionTitleForType(db, perspective, typeNodeId),
      typeNodeId,
      allowedTargetTypeIds: isTypeMembership
        ? typeTableIds
        : ruleContext?.allowedTargetTypeIds,
      addMode: isTypeMembership
        ? "link-existing"
        : relationSectionSupportsLinkExisting(perspective)
          ? "link-existing"
          : "none",
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
    schema?: SchemaFile;
    contentDir?: string;
  },
): NodePageDetail | null {
  const node = getNodeDetail(db, id);
  if (!node) return null;

  const contentDir = options?.contentDir ?? resolveContentPath();
  const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
  const views = loadViewsFromContent(contentDir);

  const sections: NodeSection[] = [{ type: "markdown", body: node.body }];

  if (node.isTypeTable) {
    const provider = generatedProviderId(views, id, ITEMS_SECTION_KEY);
    if (provider) {
      const config = getConfigByProvider(provider, contentDir);
      if (config) {
        const orderedView = getOrderedAssociationView(db, config.id, tabId, contentDir);
        if (orderedView) {
          sections.push({
            type: "ordered-association",
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
      schema: options?.schema,
      contentDir,
    }),
  );

  const properties = node.isTypeTable ? null : buildPropertiesSection(db, id);

  const metadata = getNodePageMetadata(db, id)!;

  return { ...node, metadata, properties, sections };
}
