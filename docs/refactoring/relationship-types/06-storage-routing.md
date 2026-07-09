# B6 — Storage-type routing (write path)

## What it does

When the editor or API creates or updates a relationship with a **local perspective** (e.g. user links "characters" from a scene), the system must decide:

1. **Which storage composite** the edge is stored as in `relationships.json`
2. **Which endpoint is `a` vs `b`** in the tuple

This is the **write-path resolution** behavior. It consumes the special cases documented in B1, B3, B4, and B5, plus registry and table-schema metadata.

---

## Resolution ladder

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts) implements a fixed priority order:

| Step | Condition | Result |
| --- | --- | --- |
| 0 | `member_of` / `members` perspective or storage type | `member_of` |
| 1 | `parents` or `children` slug | `parents_children` |
| 2 | Taxonomy inspiration slug (B4) | `{slug}_inspirations` if registered |
| 3 | Table-schema relation column + inverse column + registered composite | Specific composite (e.g. `scenes_product`) |
| 4 | Any registered dual composite containing perspective | That composite |
| 5 | Includes perspective slug (B3) | `includes` |
| 6 | No match | `LinkResolutionError` |

Step 3 uses `collectSetNodeIds` (B1) to map instance nodes to their type-table schema for column lookup.

Comment in source notes steps 3–4 run before includes fallback so specific composites win over generic `includes`.

---

## Tuple order

[`packages/tome-db/src/content/store.ts`](../../../packages/tome-db/src/content/store.ts)

`orderedEndpointsForLocalType` places `source` at the tuple index whose registry perspective matches the requested `localType`:

```65:77:/workspaces/tome/packages/tome-db/src/content/store.ts
function orderedEndpointsForLocalType(
  registry: RelationshipTypesFile,
  composite: string,
  source: string,
  target: string,
  localType: string,
): { a: string; b: string } {
  const normalized = normalizeRelationshipType(localType);
  const [p0, p1] = localTypesForComposite(registry, composite);
  if (p1 === normalized && p0 !== normalized) {
    return { a: target, b: source };
  }
  return { a: source, b: target };
}
```

`entryMatchesLocalType` finds existing edges when upserting or deleting—includes storage matches any includes perspective slug:

```45:57:/workspaces/tome/packages/tome-db/src/content/store.ts
function entryMatchesLocalType(
  registry: RelationshipTypesFile,
  entry: RelationshipEntry,
  localType: string,
): boolean {
  const normalized = normalizeRelationshipType(localType);
  if (isIncludesStorageType(entry.type)) {
    return isIncludesPerspectiveSlug(normalized);
  }
  const perspectives = localTypesForComposite(registry, entry.type);
  if (perspectives.includes(normalized)) return true;
  return !isBidirectionalComposite(registry, entry.type) && entry.type === normalized;
}
```

`upsertRelationship` calls `resolveCompositeTypeForLink` then `orderedEndpointsForLocalType` before appending to `relationships.json`.

---

## Registry helpers

[`packages/tome-db/src/content/relationship-types-file.ts`](../../../packages/tome-db/src/content/relationship-types-file.ts)

- `compositeTypeForPerspectives(t1, t2)` — sorted slug pair → composite name
- `resolveCompositeType` — lookup by single or pair of perspectives
- `registerSetMembershipType`, `registerIncludesType` — seed defaults in empty registries

---

## Error surface

`LinkResolutionError` message references `INCLUDES_PERSPECTIVE_SLUGS` and registry registration—reflects current hardcoded fallback set.

[`packages/tome-db/src/relationship-link-mutations.ts`](../../../packages/tome-db/src/relationship-link-mutations.ts) maps this to `unresolvable_type` on link failure.

---

## Audit script

[`packages/tome-db/scripts/audit-relationship-resolution.ts`](../../../packages/tome-db/scripts/audit-relationship-resolution.ts) duplicates expanded slug sets to simulate expected storage types for content audit (maintenance tooling, not runtime).

---

## Model files consumed

| File | Role in routing |
| --- | --- |
| `relationship-types.json` | Registry of composites and perspectives |
| `table-schemas.json` | Relation columns for step 3 inverse lookup |
| `relationships.json` | Existing edges for schema-id inference in step 3 |
| `workspace.json` | Archive node id for set collection (step 3 helper) |

Hardcoded slug sets in `includes-relationship.ts` drive steps 1, 2, and 5.

---

## Interactions

B6 is **downstream** of B1, B3, B4, B5—it orchestrates them in one ladder rather than defining its own type semantics. B7 does not participate in write routing.

Read-path inverse inference in `database-view-relations.ts` (`inferInverseRelationType`) is a **separate** hardcoded map—not the same function as write-path resolution.
