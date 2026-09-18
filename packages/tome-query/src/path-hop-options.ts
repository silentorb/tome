/**
 * Ontology-backed traverse hop options for tome-query authoring.
 * Tokens are table-schema relation column keys (not perspective labels).
 */

import type { AssociationsFile, TableSchemasFile } from "tome-flatfile";
import { normalizeAssociationId } from "tome-flatfile";

export type PathHopTypeTable = {
  id: string;
  title: string;
};

export type PathHopRelationOption = {
  token: string;
  label: string;
  association: string;
  direction: 0 | 1;
};

export type PathHopOptions = {
  typeTables: PathHopTypeTable[];
  relationsByType: Record<string, PathHopRelationOption[]>;
};

export function buildPathHopOptions(
  associations: AssociationsFile,
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
      const association = normalizeAssociationId(col.association);
      if (!associations.associations[association]) continue;
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

/** Find a relation option matching stored association + direction for a type context. */
export function matchPathHopRelation(
  options: PathHopOptions,
  typeId: string | undefined,
  association: unknown,
  direction: unknown,
): PathHopRelationOption | null {
  if (!typeId) return null;
  const assoc = typeof association === "string" ? association.trim() : "";
  const dir =
    direction === 0 || direction === 1
      ? direction
      : direction === "0" || direction === "1"
        ? (Number(direction) as 0 | 1)
        : null;
  if (!assoc || dir === null) return null;
  const list = options.relationsByType[typeId] ?? [];
  return list.find((o) => o.association === assoc && o.direction === dir) ?? null;
}
