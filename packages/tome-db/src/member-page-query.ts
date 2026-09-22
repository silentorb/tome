import type { DatabaseColumnDef, ViewSortSpec } from "tome-graph-interfaces";
import type { MemberPageRelationCountSort } from "tome-service-interfaces";
import {
  loadAssociationsFromContent,
  parseProjectionType,
  projectionTypeForEndpoint,
  isSymmetricAssociation,
} from "tome-flatfile";

/** Relation-count sort bindings for member-page SQL ORDER BY. */
export function relationCountSortsFromColumnDefs(
  sorts: ViewSortSpec[],
  columnDefs: DatabaseColumnDef[],
  contentDir: string,
): MemberPageRelationCountSort[] {
  const registry = loadAssociationsFromContent(contentDir);
  const byKey = new Map(columnDefs.map((def) => [def.key, def]));
  const out: MemberPageRelationCountSort[] = [];
  for (const sort of sorts) {
    const def = byKey.get(sort.column);
    if (!def || def.type !== "relation" || !def.relationType?.trim()) continue;
    const projectionTypes = new Set<string>([def.relationType.trim()]);
    const parsed = parseProjectionType(def.relationType);
    if (parsed) {
      const assocDef = registry.associations[parsed.associationId];
      if (assocDef && isSymmetricAssociation(assocDef)) {
        const otherIndex: 0 | 1 = parsed.endpointIndex === 0 ? 1 : 0;
        projectionTypes.add(projectionTypeForEndpoint(parsed.associationId, otherIndex));
      }
    }
    out.push({ column: sort.column, projectionTypes: [...projectionTypes] });
  }
  return out;
}
