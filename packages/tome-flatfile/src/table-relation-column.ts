import type { AssociationsFile } from "./content/associations-file";
import type { TableRelationColumn } from "./content/table-schemas-file";
import {
  perspectiveForHostTable,
  targetTypeIdForHostTable,
} from "./association-endpoints";
import { normalizeRelationshipType } from "./relation-type";
import { slugifyPropertyKey } from "./table-schema";

export function relationColumnCompositeType(col: TableRelationColumn): string {
  return normalizeRelationshipType(col.association);
}

export function perspectiveForRelationColumn(
  registry: AssociationsFile,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  const composite = relationColumnCompositeType(col);
  const def = registry.associations[composite];
  if (def) {
    const perspective = perspectiveForHostTable(def, hostTypeId);
    if (perspective) return perspective;
  }
  return normalizeRelationshipType(slugifyPropertyKey(col.name));
}

export function targetTypeIdForRelationColumn(
  registry: AssociationsFile,
  hostTypeId: string,
  col: TableRelationColumn,
): string | null {
  const composite = relationColumnCompositeType(col);
  const def = registry.associations[composite];
  if (!def) return null;
  return targetTypeIdForHostTable(def, hostTypeId);
}
