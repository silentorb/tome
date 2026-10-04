/**
 * Ontology-backed traverse hop options for tome-query authoring.
 * Tokens are table-schema relation column keys (not perspective labels).
 */

import type { RelationshipTypesFile, TableSchemasFile } from "tome-flatfile";
import { normalizeRelationshipTypeId } from "tome-flatfile";
import type { PathHopOptions, PathHopRelationOption, PathHopTypeTable } from "tome-react-flow/path-hop-options";

export type { PathHopOptions, PathHopRelationOption, PathHopTypeTable };
export { matchPathHopRelation } from "tome-react-flow/path-hop-options";

export function buildPathHopOptions(
  relationshipTypes: RelationshipTypesFile,
  tableSchemas: TableSchemasFile,
  typeTitles?: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): PathHopOptions {
  const titleOf = (typeId: string): string => {
    if (!typeTitles) return typeId;
    if (typeof (typeTitles as ReadonlyMap<string, string>).get === "function") {
      return (typeTitles as ReadonlyMap<string, string>).get(typeId) ?? typeId;
    }
    return (typeTitles as Readonly<Record<string, string>>)[typeId] ?? typeId;
  };

  const relationsByType: Record<string, PathHopRelationOption[]> = {};
  const typeIds = new Set<string>(Object.keys(tableSchemas.tables));

  for (const [typeId, table] of Object.entries(tableSchemas.tables)) {
    const options: PathHopRelationOption[] = [];
    for (const col of table.columns) {
      if (col.type !== "relation") continue;
      const association = normalizeRelationshipTypeId(col.association);
      if (!relationshipTypes.relationshipTypes[association]) continue;
      options.push({
        token: col.key,
        label: col.name,
        association,
        direction: col.endpoint,
      });
    }
    options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
    relationsByType[typeId] = options;
  }

  const typeTables: PathHopTypeTable[] = [...typeIds]
    .map((id) => ({ id, title: titleOf(id) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

  return { typeTables, relationsByType };
}
