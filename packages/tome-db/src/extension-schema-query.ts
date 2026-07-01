import type {
  ExtensionSchemaQueryServices,
  SchemaQueryRelationshipRule,
  SchemaQueryTypeTable,
} from "tome-interfaces/extension-services/schema-query";
import type { GraphDatabase, Node } from "./graph";
import { loadSchemaFromContent } from "./schema-rules/load";
import { loadTableSchemasFromContent } from "./table-schemas/load";

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
        });
      }
      entries.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      return entries;
    },

    listRelationshipRules(): SchemaQueryRelationshipRule[] {
      const schema = loadSchemaFromContent(contentDir);
      return schema.relationshipRules.map((rule) => ({
        id: rule.id,
        sourceTypeId: rule.sourceTypeId,
        type: rule.type,
        allowedTargetTypeIds: [...rule.allowedTargetTypeIds],
      }));
    },
  };
}
