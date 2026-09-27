import type { DatabaseColumnDef, ViewSortSpec } from "tome-graph-interfaces";
import type { MemberPageRelationCountSort } from "tome-service-interfaces";
import {
  loadRelationshipTypesFromContent,
  parseProjectionType,
  projectionTypeForEndpoint,
  isSymmetricRelationshipType,
} from "tome-flatfile";

/** Relation-count sort bindings for member-page SQL ORDER BY. */
export function relationCountSortsFromColumnDefs(
  sorts: ViewSortSpec[],
  columnDefs: DatabaseColumnDef[],
  contentDir: string,
): MemberPageRelationCountSort[] {
  const registry = loadRelationshipTypesFromContent(contentDir);
  const byKey = new Map(columnDefs.map((def) => [def.key, def]));
  const out: MemberPageRelationCountSort[] = [];
  for (const sort of sorts) {
    const def = byKey.get(sort.column);
    if (!def || def.type !== "relation" || !def.relationType?.trim()) continue;
    const projectionTypes = new Set<string>([def.relationType.trim()]);
    const parsed = parseProjectionType(def.relationType);
    if (parsed) {
      const assocDef = registry.relationshipTypes[parsed.relationshipTypeId];
      if (assocDef && isSymmetricRelationshipType(assocDef)) {
        const otherIndex: 0 | 1 = parsed.endpointIndex === 0 ? 1 : 0;
        projectionTypes.add(projectionTypeForEndpoint(parsed.relationshipTypeId, otherIndex));
      }
    }
    out.push({ column: sort.column, projectionTypes: [...projectionTypes] });
  }
  return out;
}
