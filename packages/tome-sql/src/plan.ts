import type {
  ExprCatalog,
  MembershipQueryIntent,
  MembershipQueryPlan,
} from "./types";

/**
 * Decide layered relational shape and order keys from Intent + catalog.
 *
 * Sort + groups semantics:
 * - With groups: always group-major prefix first.
 * - When any Intent sort binds successfully: catalog sorts (Items-like), then title/id.
 * - When no bound sorts: optional intrinsicSequence edge order (composed + Items), then title/id.
 */
export function planMembershipQuery(
  intent: MembershipQueryIntent,
  catalog: ExprCatalog,
): MembershipQueryPlan {
  const layers: MembershipQueryPlan["layers"] = ["memberUniverse"];
  if (intent.scope) {
    layers.push("scopeFilter");
  }
  if (intent.groups) {
    layers.push("groupEnrichment");
  }

  const includeGroupId = Boolean(intent.groups);

  const orderKeys: MembershipQueryPlan["orderKeys"] = [];

  if (includeGroupId) {
    orderKeys.push({ kind: "groupPrefix" });
  }

  const effectiveSorts = intent.sorts.filter((s) => {
    const col = s.column.trim();
    return col.length > 0 && catalog.sorts.has(col);
  });

  if (effectiveSorts.length > 0) {
    for (const sort of effectiveSorts) {
      orderKeys.push({
        kind: "catalogSort",
        column: sort.column.trim(),
        direction: sort.direction === "desc" ? "desc" : "asc",
      });
    }
  } else if (intent.intrinsicSequence) {
    orderKeys.push({ kind: "intrinsicSequence" });
  }

  orderKeys.push({ kind: "title" });
  orderKeys.push({ kind: "id" });

  return {
    intent,
    layers,
    includeGroupId,
    orderKeys,
    catalog,
  };
}
