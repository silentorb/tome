/**
 * Optional traverse hop UI data for ImpFlowEditor.
 * Builders that load corpus table schemas live in tome-query (`buildPathHopOptions`).
 */

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
