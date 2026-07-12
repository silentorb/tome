import { normalizeRelationshipType } from "../relation-type";
import { collectSetNodeIds } from "../set-nodes";
import {
  childNodeId,
  isSetTraitType,
  parentNodeId,
  resolveSetTraitComposite,
} from "../association-traits";
import { getTableSchema, relationColumns } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";
import {
  perspectiveForRelationColumn,
  relationColumnCompositeType,
} from "../table-relation-column";
import type { RelationshipEntry } from "./relationships-file";
import {
  AmbiguousAssociationError,
  isDualPerspectiveType,
  normalizeAssociationId,
  type AssociationsFile,
} from "./associations-file";

export class LinkResolutionError extends Error {
  constructor(public readonly localType: string) {
    super(
      `Cannot resolve storage type for perspective "${localType}": ` +
        `no registered relationship type in associations.json defines this perspective.`,
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
 * Resolution order:
 *  0. set-trait composites
 *  1. table-schema relation column on source type → column's association
 *  2. unique registry match for dual-perspective association containing the perspective
 *  3. throw LinkResolutionError or AmbiguousAssociationError
 */
export function resolveAssociationIdForLink(
  registry: AssociationsFile,
  relationships: RelationshipEntry[],
  contentDir: string,
  source: string,
  target: string,
  localType: string,
): string {
  const normalized = normalizeRelationshipType(localType);

  const setComposite = resolveSetTraitComposite(registry, normalized);
  if (setComposite) return setComposite;

  const setNodeIds = collectSetNodeIds(contentDir);
  const sourceSchemaId = schemaIdForNode(registry, source, relationships, setNodeIds);
  if (sourceSchemaId) {
    const schemas = loadTableSchemasFromContent(contentDir);
    const sourceSchema = getTableSchema(schemas, sourceSchemaId);
    if (sourceSchema) {
      for (const col of relationColumns(sourceSchema)) {
        if (col.type !== "relation") continue;
        if (perspectiveForRelationColumn(registry, sourceSchemaId, col) === normalized) {
          return relationColumnCompositeType(col);
        }
      }
    }
  }

  const matches: string[] = [];
  for (const [associationId, def] of Object.entries(registry.associations)) {
    if (isDualPerspectiveType(def) && def.perspectives.includes(normalized)) {
      matches.push(associationId);
    }
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new AmbiguousAssociationError(normalized, matches);
  }

  throw new LinkResolutionError(normalized);
}
