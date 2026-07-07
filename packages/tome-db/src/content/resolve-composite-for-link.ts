import {
  isIncludesPerspectiveSlug,
  INCLUDES_TYPE,
  TAXONOMY_INSPIRATION_PERSPECTIVES,
  PARENTS_CHILDREN_PERSPECTIVES,
  PARENTS_CHILDREN_COMPOSITE,
} from "../includes-relationship";
import { normalizeRelationshipType } from "../relation-type";
import { collectSetNodeIds } from "../set-membership";
import {
  childNodeId,
  isSetTraitType,
  parentNodeId,
  resolveSetTraitComposite,
} from "../relationship-type-traits";
import { getTableSchema, relationColumns, slugifyPropertyKey } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";
import type { RelationshipEntry } from "./relationships-file";
import type { RelationshipTypesFile } from "./relationship-types-file";
import {
  compositeTypeForPerspectives,
  isDualPerspectiveType,
} from "./relationship-types-file";
import type { TableRelationColumn } from "./table-schemas-file";

export class LinkResolutionError extends Error {
  constructor(public readonly localType: string) {
    super(
      `Cannot resolve storage type for perspective "${localType}": ` +
        `no registered dual-perspective composite or includes slug match. ` +
        `Register a bidirectional composite in relationship-types.json or add the slug to INCLUDES_PERSPECTIVE_SLUGS.`,
    );
    this.name = "LinkResolutionError";
  }
}

function perspectiveForRelationColumn(col: TableRelationColumn): string {
  return normalizeRelationshipType(col.perspective ?? slugifyPropertyKey(col.name));
}

function memberDatabaseId(
  registry: RelationshipTypesFile,
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  for (const entry of relationships) {
    const def = registry.types[normalizeRelationshipType(entry.type)];
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
 * Resolve the storage composite type for a new link.
 *
 * Resolution order (no single-perspective fallback):
 *  1. parents/children → "parents_children"
 *  2. taxonomy inspiration → "{perspective}_inspirations" (must be registered dual)
 *  3. table-schema inverse column + registered dual composite (specific composite takes priority)
 *  4. direct registry lookup for existing dual-perspective composite containing the perspective
 *  5. includes slug → "includes" (generic associative fallback)
 *  6. throw LinkResolutionError
 *
 * Steps 3-4 are checked BEFORE the includes fallback so that specific composites
 * (e.g. scenes_product) win over generic `includes` when table schemas define an inverse.
 */
export function resolveCompositeTypeForLink(
  registry: RelationshipTypesFile,
  relationships: RelationshipEntry[],
  contentDir: string,
  source: string,
  target: string,
  localType: string,
): string {
  const normalized = normalizeRelationshipType(localType);

  // 0. set-trait composites (e.g. member_of)
  const setComposite = resolveSetTraitComposite(registry, normalized);
  if (setComposite) return setComposite;

  // 1. parents/children → structural composite
  if (PARENTS_CHILDREN_PERSPECTIVES.has(normalized)) {
    return PARENTS_CHILDREN_COMPOSITE;
  }

  // 2. taxonomy inspiration → *_inspirations composite
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) {
    const composite = compositeTypeForPerspectives(normalized, "inspirations");
    if (registry.types[composite] && isDualPerspectiveType(registry.types[composite])) {
      return composite;
    }
  }

  // 3. table-schema inverse column lookup (specific composite)
  const setNodeIds = collectSetNodeIds(contentDir);
  const sourceSchemaId = schemaIdForNode(registry, source, relationships, setNodeIds);
  const targetSchemaId = schemaIdForNode(registry, target, relationships, setNodeIds);
  if (sourceSchemaId && targetSchemaId) {
    const schemas = loadTableSchemasFromContent(contentDir);
    const sourceSchema = getTableSchema(schemas, sourceSchemaId);
    const targetSchema = getTableSchema(schemas, targetSchemaId);
    if (sourceSchema && targetSchema) {
      const column = relationColumns(sourceSchema).find(
        (col) =>
          col.type === "relation" &&
          perspectiveForRelationColumn(col) === normalized &&
          col.targetTypeId === targetSchemaId,
      );
      if (column) {
        const inverseCol = relationColumns(targetSchema).find(
          (col) => col.type === "relation" && col.targetTypeId === sourceSchemaId,
        );
        if (inverseCol) {
          const inverse = perspectiveForRelationColumn(inverseCol);
          const composite = compositeTypeForPerspectives(normalized, inverse);
          if (registry.types[composite] && isDualPerspectiveType(registry.types[composite])) {
            return composite;
          }
        }
      }
    }
  }

  // 4. direct registry lookup for any dual-perspective composite containing this perspective
  for (const [composite, def] of Object.entries(registry.types)) {
    if (isDualPerspectiveType(def) && def.perspectives.includes(normalized)) {
      return composite;
    }
  }

  // 5. includes slug → generic associative
  if (isIncludesPerspectiveSlug(normalized)) return INCLUDES_TYPE;

  // 6. hard error
  throw new LinkResolutionError(normalized);
}
