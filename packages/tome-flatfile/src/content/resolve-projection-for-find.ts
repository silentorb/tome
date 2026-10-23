import {
  type RelationshipTypesFile,
  normalizeRelationshipTypeId,
  parseProjectionType,
  projectionTypeForEndpoint,
} from "./relationship-types-file";
import { isSetTraitType, setRoleIndices } from "../relationship-type-traits";
import { collectSetNodeIds } from "../set-nodes";

/** Resolve a composite or projection type arg to a relationship-type ULID, or null. */
export function relationshipTypeIdFromTypeArg(
  registry: RelationshipTypesFile,
  relationshipTypeOrProjection: string,
): string | null {
  const trimmed = relationshipTypeOrProjection.trim();
  const parsed = parseProjectionType(trimmed);
  if (parsed) return parsed.relationshipTypeId;
  const id = normalizeRelationshipTypeId(trimmed);
  if (registry.relationshipTypes[id]) return id;
  return null;
}

/**
 * Place `source`/`target` into the tuple so that `source` occupies `sourceIndex`.
 * When omitted, set-trait heuristics place a set node at the parent index;
 * otherwise source stays at index 0.
 */
export function orderedEndpointsForRelationshipType(
  registry: RelationshipTypesFile,
  composite: string,
  source: string,
  target: string,
  relationshipTypeOrProjection: string,
  contentDir: string,
): { a: string; b: string } {
  const parsed = parseProjectionType(relationshipTypeOrProjection);
  if (parsed) {
    if (parsed.endpointIndex === 1) return { a: target, b: source };
    return { a: source, b: target };
  }

  const def = registry.relationshipTypes[normalizeRelationshipTypeId(composite)];
  if (def && isSetTraitType(def)) {
    const { parentIndex, childIndex } = setRoleIndices(def);
    const setNodeIds = collectSetNodeIds(contentDir);
    if (setNodeIds.has(source)) {
      return parentIndex === 0
        ? { a: source, b: target }
        : { a: target, b: source };
    }
    if (setNodeIds.has(target)) {
      return childIndex === 0
        ? { a: source, b: target }
        : { a: target, b: source };
    }
  }

  return { a: source, b: target };
}

/**
 * Resolve a composite or projection type to the oriented projection type used for
 * endpoint lookups (`findRelationship` / cache `getRelationship`).
 */
export function projectionTypeForFind(
  registry: RelationshipTypesFile,
  relationshipTypeOrProjection: string,
  source: string,
  target: string,
  contentDir: string,
): string {
  const parsed = parseProjectionType(relationshipTypeOrProjection);
  if (parsed) return relationshipTypeOrProjection.trim();
  const relationshipTypeId = relationshipTypeIdFromTypeArg(registry, relationshipTypeOrProjection);
  if (!relationshipTypeId) return relationshipTypeOrProjection.trim();
  const { a } = orderedEndpointsForRelationshipType(
    registry,
    relationshipTypeId,
    source,
    target,
    relationshipTypeOrProjection,
    contentDir,
  );
  return projectionTypeForEndpoint(relationshipTypeId, a === source ? 0 : 1);
}
