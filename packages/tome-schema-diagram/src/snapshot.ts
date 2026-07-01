import type {
  SchemaQueryRelationColumnEdge,
  SchemaQueryTypeTable,
} from "tome-interfaces/extension-services/schema-query";
import type { SchemaDiagramConfig } from "./config";

export interface SchemaDiagramSnapshot {
  typeTables: SchemaQueryTypeTable[];
  relationColumnEdges: SchemaQueryRelationColumnEdge[];
}

export function filterSnapshot(
  snapshot: SchemaDiagramSnapshot,
  config: SchemaDiagramConfig,
): SchemaDiagramSnapshot {
  const typeIdSet = config.typeIds ? new Set(config.typeIds) : null;
  const typeTables = typeIdSet
    ? snapshot.typeTables.filter((table) => typeIdSet.has(table.id))
    : snapshot.typeTables;

  const allowedTypeIds = new Set(typeTables.map((table) => table.id));
  const relationshipTypeSet = config.relationshipTypes
    ? new Set(config.relationshipTypes)
    : null;

  const relationColumnEdges = snapshot.relationColumnEdges.filter((edge) => {
    if (relationshipTypeSet && !relationshipTypeSet.has(edge.label)) return false;
    if (!allowedTypeIds.has(edge.sourceTypeId)) return false;
    return allowedTypeIds.has(edge.targetTypeId);
  });

  return { typeTables, relationColumnEdges };
}
