import { collectSetNodeIds } from "../set-nodes";
import {
  childNodeId,
  isSetTraitType,
  parentNodeId,
} from "../association-traits";
import { getTableSchema, relationColumns } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";
import {
  projectionTypeForRelationColumn,
  relationColumnCompositeType,
} from "../table-relation-column";
import type { RelationshipEntry } from "./relationships-file";
import {
  isAssociationId,
  normalizeAssociationId,
  parseProjectionType,
  requireAssociationId,
  type AssociationsFile,
} from "./associations-file";

export class LinkResolutionError extends Error {
  constructor(public readonly associationId: string) {
    super(
      `Cannot resolve storage type for association "${associationId}": ` +
        `no registered relationship type in associations.json.`,
    );
    this.name = "LinkResolutionError";
  }
}

function memberDatabaseId(
  registry: AssociationsFile,
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  for (const entry of relationships) {
    const def = registry.associations[normalizeAssociationId(entry.type)];
    if (!isSetTraitType(def)) continue;
    const child = childNodeId(def, entry);
    const parent = parentNodeId(def, entry);
    if (child === nodeId && setNodeIds.has(parent)) return parent;
  }
  return null;
}

function schemaIdForNode(
  registry: AssociationsFile,
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  if (setNodeIds.has(nodeId)) return nodeId;
  return memberDatabaseId(registry, nodeId, relationships, setNodeIds);
}

/**
 * Resolve the storage association id for a new link.
 *
 * Callers pass an association ULID or a directed projection type (`ULID:0`).
 * Resolution order when a bare label-like string is passed:
 *  0. already a registered association id
 *  1. table-schema relation column on source type matching the projection type
 *  2. throw LinkResolutionError
 */
export function resolveAssociationIdForLink(
  registry: AssociationsFile,
  relationships: RelationshipEntry[],
  contentDir: string,
  source: string,
  target: string,
  associationOrProjection: string,
): string {
  void target;
  const trimmed = associationOrProjection.trim();
  const parsed = parseProjectionType(trimmed);
  if (parsed) {
    return requireAssociationId(registry, parsed.associationId);
  }
  if (isAssociationId(trimmed) && registry.associations[trimmed]) {
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
    return requireAssociationId(registry, trimmed);
  } catch {
    throw new LinkResolutionError(trimmed);
  }
}
