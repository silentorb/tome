import type { AssociationDefinition, AssociationsFile } from "./content/associations-file";
import {
  normalizeAssociationId,
  perspectiveConfigAt,
  perspectiveTitle,
  projectionTypeForEndpoint,
} from "./content/associations-file";
import type { TableRelationColumn } from "./content/table-schemas-file";
import {
  hostEndpointIndex,
  projectionTypeForHostTable,
  targetTypeIdForHostTable,
} from "./association-endpoints";
import { normalizeRelationshipType, relationType } from "./relation-type";
import { slugifyPropertyKey } from "./table-schema";

export function relationColumnCompositeType(col: TableRelationColumn): string {
  return normalizeAssociationId(col.association);
}

function perspectiveSlugAt(def: AssociationDefinition, index: 0 | 1): string {
  return normalizeRelationshipType(slugifyPropertyKey(perspectiveTitle(perspectiveConfigAt(def, index))));
}

/** Match a table column to an endpoint when host typing is ambiguous (same type both sides / no endpoints). */
function endpointIndexMatchingColumn(
  def: AssociationDefinition,
  col: TableRelationColumn,
): 0 | 1 | null {
  const candidates = new Set(
    [col.key, col.name, relationType(col.name), slugifyPropertyKey(col.name)]
      .map((value) => normalizeRelationshipType(value))
      .filter(Boolean),
  );
  const matches: Array<0 | 1> = [];
  for (const index of [0, 1] as const) {
    if (candidates.has(perspectiveSlugAt(def, index))) {
      matches.push(index);
    }
  }
  if (matches.length === 1) return matches[0]!;
  return null;
}

function endpointsHaveDistinctHosts(def: AssociationDefinition): boolean {
  if (!def.endpoints) return false;
  return def.endpoints[0].typeId !== def.endpoints[1].typeId;
}

/** Directed projection type for a relation column on `hostTypeId`. */
export function projectionTypeForRelationColumn(
  registry: AssociationsFile,
  hostTypeId: string,
  col: TableRelationColumn,
): string {
  const composite = relationColumnCompositeType(col);
  const def = registry.associations[composite];
  if (def) {
    if (endpointsHaveDistinctHosts(def)) {
      const type = projectionTypeForHostTable(def, composite, hostTypeId);
      if (type) return type;
    }
    const byColumn = endpointIndexMatchingColumn(def, col);
    if (byColumn !== null) return projectionTypeForEndpoint(composite, byColumn);
    const index = hostEndpointIndex(def, hostTypeId);
    if (index !== null) return projectionTypeForEndpoint(composite, index);
  }
  return projectionTypeForEndpoint(composite, 0);
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
