# R6 — Write-path routing

## What it does

When the editor or API creates or updates a relationship with a **local perspective** (e.g. user links `characters` from a scene), the system must decide:

1. **Which storage composite** the edge is stored as in `relationships.json`
2. **Which endpoint is `a` vs `b`** in the tuple

This is the **write-path resolution** behavior. It consumes set traits (R2), table-schema metadata (R7), and registry entries (R1, R4).

---

## Resolution ladder

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts)

| Step | Condition | Result |
| --- | --- | --- |
| 0 | Perspective on a `set`-trait composite | That composite (e.g. `member_of`, `ordered_member_of`) |
| 1 | Table-schema relation column on source type-table + matching perspective | Column's `relationshipType` |
| 2 | Any registered dual composite containing perspective | That composite (first match in registry iteration order) |
| 3 | No match | `LinkResolutionError` |

Source comment in file:

```64:68:/workspaces/tome/packages/tome-db/src/content/resolve-composite-for-link.ts
 * Resolution order:
 *  0. set-trait composites (e.g. member_of)
 *  1. table-schema relation column on source type → column's relationshipType
 *  2. direct registry lookup for dual-perspective composite containing the perspective
 *  3. throw LinkResolutionError
```

There is **no includes fallback** — unresolvable perspectives throw.

---

## Step 3 helpers

`schemaIdForNode` — resolves a node's effective type-table ID:

- Direct set node (key in `table-schemas.json` or archive hub)
- Or member node via `memberDatabaseId` (walks set-trait membership edges)

Then scans relation columns on that schema; matches `perspectiveForRelationColumn(registry, sourceSchemaId, col) === normalized`.

---

## Tuple order

[`packages/tome-db/src/content/store.ts`](../../../packages/tome-db/src/content/store.ts)

`orderedEndpointsForLocalType` places `source` at the tuple index whose registry perspective matches the requested `localType`:

```59:71:/workspaces/tome/packages/tome-db/src/content/store.ts
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

`entryMatchesLocalType` finds existing edges when upserting or deleting — matches if the entry's composite perspectives include the requested local type.

`upsertRelationship` calls `resolveCompositeTypeForLink` then `orderedEndpointsForLocalType` before appending to `relationships.json`.

---

## Registry requirement

`upsertRelationship` requires the resolved composite to exist in `relationship-types.json`. Unregistered composites throw `LinkResolutionError` (no auto-registration on production write paths). Test fixtures seed types via [`test-helpers.ts`](../../../packages/tome-db/src/content/test-helpers.ts).

---

## Error surface

`LinkResolutionError` message references registry registration requirement.

[`packages/tome-db/src/relationship-link-mutations.ts`](../../../packages/tome-db/src/relationship-link-mutations.ts) maps this to `unresolvable_type` on link failure.

---

## Audit tooling

[`packages/tome-db/scripts/audit-relationship-resolution.ts`](../../../packages/tome-db/scripts/audit-relationship-resolution.ts) — maintenance script to verify content has no unresolvable perspective slugs.

---

## Model files consumed

| File | Role in routing |
| --- | --- |
| `relationship-types.json` | Registry of composites, traits, perspectives, endpoints |
| `table-schemas.json` | Relation columns for step 1 |
| `relationships.json` | Existing edges for `memberDatabaseId` in step 1 |
| `workspace.json` | Archive node id for `collectSetNodeIds` |

---

## Interactions

R6 is **downstream** of R2, R4, R7 — it orchestrates them in one ladder rather than defining its own type semantics. R8 and R9 do not participate in write routing.

Read-path hydration (R8) uses column metadata directly — not this function.

---

## What no longer applies

- Includes fallback as ladder step
- Ladder shortcuts for `parents_children` and taxonomy `_inspirations` slug sets
- Production auto-registration in `upsertRelationship`
- `entryMatchesLocalType` special case matching any includes perspective slug against `includes` storage type
