import { collectSetNodeIds } from "../set-nodes";
import {
  childNodeId,
  isSetTraitType,
  parentNodeId,
} from "../relationship-type-traits";
import { getTableSchema, relationColumns } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";
import {
  projectionTypeForRelationColumn,
  relationColumnCompositeType,
} from "../table-relation-column";
import type { RelationshipEntry } from "./relationships-file";
import {
  isRelationshipTypeId,
  normalizeRelationshipTypeId,
  parseProjectionType,
  requireRelationshipTypeId,
  type RelationshipTypesFile,
} from "./relationship-types-file";

export class LinkResolutionError extends Error {
  constructor(public readonly relationshipTypeId: string) {
    super(
      `Cannot resolve storage type for relationship type "${relationshipTypeId}": ` +
        `no registered relationship type in associations.json.`,
    );
    this.name = "LinkResolutionError";
  }
}

function memberDatabaseId(
  registry: RelationshipTypesFile,
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  for (const entry of relationships) {
    const def = registry.relationshipTypes[normalizeRelationshipTypeId(entry.type)];
    if (!isSetTraitType(def)) continue;
    const child = childNodeId(def, entry);
    const parent = parentNodeId(def, entry);
    if (child === nodeId && setNodeIds.has(parent)) return parent;
  }
  return null;
}

function schemaIdForNode(
  registry: RelationshipTypesFile,
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  if (setNodeIds.has(nodeId)) return nodeId;
  return memberDatabaseId(registry, nodeId, relationships, setNodeIds);
}

/**
 * Resolve the storage relationship type id for a new link.
 *
 * Callers pass a relationship type ULID or a directed projection type (`ULID:0`).
 * Resolution order when a bare label-like string is passed:
 *  0. already a registered relationship type id
 *  1. table-schema relation column on source type matching the projection type
 *  2. throw LinkResolutionError
 */
export function resolveRelationshipTypeIdForLink(
  registry: RelationshipTypesFile,
  relationships: RelationshipEntry[],
  contentDir: string,
  source: string,
  target: string,
  relationshipTypeOrProjection: string,
): string {
  void target;
  const trimmed = relationshipTypeOrProjection.trim();
  const parsed = parseProjectionType(trimmed);
  if (parsed) {
    return requireRelationshipTypeId(registry, parsed.relationshipTypeId);
  }
  if (isRelationshipTypeId(trimmed) && registry.relationshipTypes[trimmed]) {
    return trimmed;
  }

  const setNodeIds = collectSetNodeIds(contentDir);
  const sourceSchemaId = schemaIdForNode(registry, source, relationships, setNodeIds);
  if (sourceSchemaId) {
    const schemas = loadTableSchemasFromContent(contentDir);
    const sourceSchema = getTableSchema(schemas, sourceSchemaId);
    if (sourceSchema) {
      for (const col of relationColumns(sourceSchema)) {
        if (col.type !== "relation") continue;
        if (
          projectionTypeForRelationColumn(registry, sourceSchemaId, col) === trimmed
        ) {
          return relationColumnCompositeType(col);
        }
      }
    }
  }

  try {
    return requireRelationshipTypeId(registry, trimmed);
  } catch {
    throw new LinkResolutionError(trimmed);
  }
}
