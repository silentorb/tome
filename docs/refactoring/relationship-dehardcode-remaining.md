# Relationship type dehardcoding — status

## Purpose

Tracks residual relationship-type hardcoding after the critical-path dehardcode work. For how relationships work today, see [tome-db](../features/tome-db.md), [set membership](../features/set-membership.md), and [ordered associations](../features/ordered-associations.md).

---

## Done

| Area | Artifact |
| --- | --- |
| Perspectives + tuple-order semantics | Registry `perspectives`; `orderedEndpointsForLocalType` in `store.ts` |
| `set` / `ordered` traits | `relationship-type-traits.ts`, registry `traits` |
| Per-flavor composites + `endpoints` | Includes collapse deleted; corpus `relationship-types.json` |
| Table-schema `relationshipType` on relation columns | `table-relation-column.ts` |
| Write path | `resolve-composite-for-link.ts`: set-trait → table-schema → registry scan → error |
| Read path | Column-driven hydration in `database-view-relations.ts` |
| Allowed targets | Registry endpoints via `relationship-type-endpoints.ts` |
| Structural / link-existing policy | Registry `linkExisting` / perspective labels (no slug sets) |
| Membership perspectives | Derived from `typesWithTrait(registry, "set")` — archive SQL, capabilities, page sections |
| Ordered associations | Ordered-trait validation; group-link perspective from config/registry |
| Presentation | Trait-based hide/sort; structural `linkExisting` for addMode |
| Deprecated rule shims | `schema-rules/resolve.ts` removed |
| View section keys | `viewSectionKeyForSet` / `membershipPerspectivesForSet` (no `MEMBERS_*` constants) |
| Editor unlink/move/view CRUD | Uses `viewRelationshipType` + `memberSidePerspective` on view payloads |
| Conventional empty-registry fallbacks | Removed; seed helpers still register `member_of` / `ordered_member_of` |
| `labels.ts` membership constants | Deleted |

---

## Remaining (out of package DoD or corpus)

| Item | Notes |
| --- | --- |
| Empty-workspace seed helpers | `registerSetMembershipType` / `registerOrderedSetMembershipType` still use conventional names — allowed |
| Tests / fixtures / one-time migrations | May use literal membership type names |
| tome-spatial-graph defaults | `parents` / `children` / `neighbor` as overridable extension config defaults |
| Corpus cleanup (Step 6) | ULID-suffixed registry keys, residual `includes` rows — marloth-story content, not tome packages |
| Feature doc wording | `tome-db.md` may still mention includes collapse — separate doc fix |

---

## Definition of done (packages)

Relationship type hardcoding is removed from production tome package source when:

- No `ReadonlySet` of perspective slugs in production source (tests/fixtures excepted)
- No literal checks for `member_of`, `parents_children`, or taxonomy slug sets outside empty-workspace registry seed helpers
- Write path is only: **set-trait → table-schema column → registry scan → error**
- Presentation and link-existing policy read registry traits / perspective labels only
- Archive, ordered-associations, and SQL cache queries derive membership from `set` trait
- View payloads carry set/member perspectives so the editor does not invent type names

---

## Related docs

| Doc | Role |
| --- | --- |
| [tome-db](../features/tome-db.md) | Feature spec |
| [set-membership](../features/set-membership.md) | Set trait semantics |
| [ordered-associations](../features/ordered-associations.md) | Grouped ordered views |
| [relationship-behaviors/](relationship-behaviors/) | Descriptive inventory (optional reference) |
| [relationship-types/](relationship-types/) | Superseded includes-collapse-era inventory |
