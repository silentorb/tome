import {
  normalizeRelationshipTypeId,
  projectionTypeForEndpoint,
} from "./content/relationship-types-file";
import type { RelationshipTypesFile } from "./content/relationship-types-file";
import type { TableRelationColumn } from "./content/table-schemas-file";

export function relationColumnCompositeType(col: TableRelationColumn): string {
  return normalizeRelationshipTypeId(col.association);
}

/** Directed projection type for a relation column (`association` + `endpoint`). */
export function projectionTypeForRelationColumn(
  _registry: RelationshipTypesFile,
  _hostTypeId: string,
  col: TableRelationColumn,
): string {
  return projectionTypeForEndpoint(relationColumnCompositeType(col), col.endpoint);
}

/** Target type-table id for the opposite endpoint of a relation column. */
export function targetTypeIdForRelationColumn(
  registry: RelationshipTypesFile,
  _hostTypeId: string,
  col: TableRelationColumn,
): string | null {
  const composite = relationColumnCompositeType(col);
  const def = registry.relationshipTypes[composite];
  if (!def?.endpoints) return null;
  const other: 0 | 1 = col.endpoint === 0 ? 1 : 0;
  return def.endpoints[other].typeId;
}
