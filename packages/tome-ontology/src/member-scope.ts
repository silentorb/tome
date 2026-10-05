/** Graph-authored type-table member scope (predicate selects members). */

export interface MemberScope {
  /** Member-scope instance node id. */
  id: string;
  /** Type-table hub whose Members / type checks use the predicate. */
  typeTableId: string;
  /** Active ontology predicate id (must have a node-filter). */
  predicateId: string;
  title?: string;
}

/**
 * Resolve the predicate id for a type table from active member-scopes.
 * v1: first matching scope wins (stable sort by scope id).
 */
export function memberPredicateForTypeTable(
  scopes: readonly MemberScope[],
  typeTableId: string,
): string | undefined {
  const hub = typeTableId.trim();
  if (!hub) return undefined;
  const matches = scopes
    .filter((s) => s.typeTableId === hub && s.predicateId.trim())
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  return matches[0]?.predicateId;
}

/** Type tables that have at least one active member-scope. */
export function typeTablesWithMemberScope(scopes: readonly MemberScope[]): string[] {
  const ids = new Set<string>();
  for (const scope of scopes) {
    if (scope.typeTableId.trim() && scope.predicateId.trim()) {
      ids.add(scope.typeTableId);
    }
  }
  return [...ids];
}
