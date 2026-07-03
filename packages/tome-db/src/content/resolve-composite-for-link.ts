import { isIncludesPerspectiveSlug, INCLUDES_TYPE } from "../includes-relationship";
import { normalizeRelationshipType } from "../relation-type";
import { collectSetNodeIds } from "../set-membership";
import { getTableSchema, relationColumns, slugifyPropertyKey } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";
import type { RelationshipEntry } from "./relationships-file";
import type { RelationshipTypesFile } from "./relationship-types-file";
import {
  compositeTypeForPerspectives,
  resolveCompositeType,
} from "./relationship-types-file";
import type { TableRelationColumn } from "./table-schemas-file";
import { isSetMembershipStorageType } from "../set-membership";

function perspectiveForRelationColumn(col: TableRelationColumn): string {
  return normalizeRelationshipType(col.perspective ?? slugifyPropertyKey(col.name));
}

function memberDatabaseId(
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  for (const entry of relationships) {
    if (!isSetMembershipStorageType(entry.type)) continue;
    if (entry.a === nodeId && setNodeIds.has(entry.b)) return entry.b;
    if (entry.b === nodeId && setNodeIds.has(entry.a)) return entry.a;
  }
  return null;
}

function schemaIdForNode(
  nodeId: string,
  relationships: RelationshipEntry[],
  setNodeIds: Set<string>,
): string | null {
  if (setNodeIds.has(nodeId)) return nodeId;
  return memberDatabaseId(nodeId, relationships, setNodeIds);
}

/** Resolve storage composite for a new link using table-schemas inverse columns when registered. */
export function resolveCompositeTypeForLink(
  registry: RelationshipTypesFile,
  relationships: RelationshipEntry[],
  contentDir: string,
  source: string,
  target: string,
  localType: string,
): string {
  const normalized = normalizeRelationshipType(localType);
  if (isIncludesPerspectiveSlug(normalized)) return INCLUDES_TYPE;

  const setNodeIds = collectSetNodeIds(contentDir);
  const sourceSchemaId = schemaIdForNode(source, relationships, setNodeIds);
  const targetSchemaId = schemaIdForNode(target, relationships, setNodeIds);
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
          if (registry.types[composite]) return composite;
        }
      }
    }
  }

  return resolveCompositeType(registry, normalized);
}
