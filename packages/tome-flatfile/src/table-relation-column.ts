import type { RelationshipTypesFile } from "./content/relationship-types-file";
import type { TableRelationColumn } from "./content/table-schemas-file";
import {
  perspectiveForHostTable,
  targetTypeIdForHostTable,
} from "./relationship-type-endpoints";
import { normalizeRelationshipType } from "./relation-type";
import { slugifyPropertyKey } from "./table-schema";

export function relationColumnCompositeType(col: TableRelationColumn): string {
  return normalizeRelationshipType(col.relationshipType);
}

export function perspectiveForRelationColumn(
  registry: RelationshipTypesFile,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  const composite = relationColumnCompositeType(col);
  const def = registry.types[composite];
  if (def) {
    const perspective = perspectiveForHostTable(def, hostTypeId);
    if (perspective) return perspective;
  }
  return normalizeRelationshipType(slugifyPropertyKey(col.name));
}

export function targetTypeIdForRelationColumn(
  registry: RelationshipTypesFile,
  hostTypeId: string,
  col: TableRelationColumn,
): string | null {
  const composite = relationColumnCompositeType(col);
  const def = registry.types[composite];
  if (!def) return null;
  return targetTypeIdForHostTable(def, hostTypeId);
}
