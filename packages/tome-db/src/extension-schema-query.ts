import type {
  ExtensionSchemaQueryServices,
  SchemaQueryRelationColumnEdge,
  SchemaQueryRelationshipRule,
  SchemaQueryTypeTable,
} from "tome-interfaces/extension-services/schema-query";
import type { GraphDatabase, Node } from "./graph";
import { setMemberIds } from "./set-membership";
import { loadTableSchemasFromContent } from "./table-schemas/load";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { relationshipTypeRulesFromRegistry } from "./relationship-type-endpoints";
import {
  perspectiveForRelationColumn,
  targetTypeIdForRelationColumn,
} from "./table-relation-column";

function titleFromNode(node: Node | null): string {
  if (!node) return "Untitled";
  const title = node.properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = node.properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

export function createExtensionSchemaQueryServices(
  db: GraphDatabase,
  contentDir: string,
): ExtensionSchemaQueryServices {
  return {
    listTypeTables(): SchemaQueryTypeTable[] {
      const schemas = loadTableSchemasFromContent(contentDir);
      const entries: SchemaQueryTypeTable[] = [];
      for (const id of Object.keys(schemas.tables)) {
        entries.push({
          id,
          title: titleFromNode(db.getNode(id)),
          memberCount: setMemberIds(db, id, contentDir).length,
        });
      }
      entries.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      return entries;
    },

    listRelationshipRules(): SchemaQueryRelationshipRule[] {
      const registry = loadRelationshipTypesFromContent(contentDir);
      return relationshipTypeRulesFromRegistry(registry).map((rule) => ({
        id: rule.id,
        sourceTypeId: rule.sourceTypeId,
        type: rule.type,
        allowedTargetTypeIds: [...rule.allowedTargetTypeIds],
      }));
    },

    listRelationColumnEdges(): SchemaQueryRelationColumnEdge[] {
      const schemas = loadTableSchemasFromContent(contentDir);
      const registry = loadRelationshipTypesFromContent(contentDir);
      const titleByTypeId = new Map<string, string>();
      for (const id of Object.keys(schemas.tables)) {
        titleByTypeId.set(id, titleFromNode(db.getNode(id)));
      }

      const edges: SchemaQueryRelationColumnEdge[] = [];
      for (const [sourceTypeId, table] of Object.entries(schemas.tables)) {
        for (const column of table.columns) {
          if (column.type !== "relation") continue;
          const targetTypeId = targetTypeIdForRelationColumn(registry, sourceTypeId, column);
          if (!targetTypeId) continue;
          const label = perspectiveForRelationColumn(registry, sourceTypeId, column);
          edges.push({
            id: `${sourceTypeId}:${column.key}`,
            sourceTypeId,
            targetTypeId,
            label,
          });
        }
      }

      edges.sort((a, b) => {
        const sourceCompare = (titleByTypeId.get(a.sourceTypeId) ?? a.sourceTypeId).localeCompare(
          titleByTypeId.get(b.sourceTypeId) ?? b.sourceTypeId,
          undefined,
          { sensitivity: "base" },
        );
        if (sourceCompare !== 0) return sourceCompare;
        const labelCompare = a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        if (labelCompare !== 0) return labelCompare;
        return (titleByTypeId.get(a.targetTypeId) ?? a.targetTypeId).localeCompare(
          titleByTypeId.get(b.targetTypeId) ?? b.targetTypeId,
          undefined,
          { sensitivity: "base" },
        );
      });

      return edges;
    },
  };
}
