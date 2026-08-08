# Relationship type dehardcoding — status

## Purpose

Tracks residual relationship-type hardcoding after the critical-path dehardcode work. For how relationships work today, see [tome-db](../features/tome-db.md), [sets](../features/sets.md), and [table presentation](../features/table-presentation.md).

---

## Done

| Area | Artifact |
| --- | --- |
| Perspectives + tuple-order semantics | Registry `perspectives`; `orderedEndpointsForLocalType` in `store.ts` |
| `set` / `ordered` traits | `association-traits.ts`, registry `traits` |
| Per-flavor composites + `endpoints` | Includes collapse deleted; corpus `associations.json` |
| Table-schema `association` on relation columns | `table-relation-column.ts` |
| Write path | `resolve-composite-for-link.ts`: set-trait → table-schema → registry scan → error |
| Read path | Column-driven hydration in `database-view-relations.ts` |
| Allowed targets | Registry endpoints via `relationship-type-endpoints.ts` |
| Structural / link-existing policy | Registry `linkExisting` / perspective labels (no slug sets) |
| Set perspectives | Derived from `typesWithTrait(registry, "set")` + `setRolePerspectivesForNode` (views / sole fallback) |
| Ordered collections | Ordered-trait validation; group-link perspective from config/registry |
| Presentation | Trait-based hide/sort; structural `linkExisting` for addMode |
| Deprecated rule shims | `schema-rules/resolve.ts` removed |
| View section keys | View / `setRolePerspectivesForNode` (no `MEMBERS_*` constants) |
| Editor unlink/move/view CRUD | Uses `viewAssociation` + `memberSidePerspective` on view payloads |
| Empty-workspace membership seeds | **Disallowed** — no `registerSetMembershipType` / conventional `member_of` seed into empty registries; tests use explicit `registerSetAssociation` |
| `membershipComposite` on table schemas | **Removed** — perspectives come from views/caller context via `setRolePerspectivesForNode` |
| `labels.ts` membership constants | Deleted |
| Association registry keys | **ULID** — opaque association ids; perspectives remain snake_case slugs |

---

## Remaining (out of package DoD or corpus)

| Item | Notes |
| --- | --- |
| Tests / fixtures / one-time migrations | May use literal project **perspective** names (e.g. Marloth `member_of`); association **ids** are ULIDs |
| tome-spatial-graph defaults | `parents` / `children` / `neighbor` as overridable extension config defaults |
| Feature doc wording | Keep docs aligned with ULID association ids (includes-collapse era wording is obsolete) |

---

## Definition of done (packages)

Relationship type hardcoding is removed from production tome package source when:

- No `ReadonlySet` of perspective slugs in production source (tests/fixtures excepted)
- No literal checks for `member_of`, `parents_children`, or taxonomy slug sets in production source
- No empty-workspace helpers that seed conventional membership association names
- No `membershipComposite` (or equivalent) on `table-schemas.json`
- Write path is only: **set-trait → table-schema column → registry scan → error**
- Presentation and link-existing policy read registry traits / perspective labels only
- Archive, table-presentation, and SQL cache queries derive set edges from `set` trait
- View payloads carry set/member perspectives so the editor does not invent type names

---

## Related docs

| Doc | Role |
| --- | --- |
| [tome-db](../features/tome-db.md) | Feature spec |
| [sets](../features/sets.md) | Set trait semantics |
| [table-presentation](../features/table-presentation.md) | Scope tabs, row groups, ordered views |
| [relationship-behaviors/](relationship-behaviors/) | Descriptive inventory (optional reference) |
| [associations/](associations/) | Superseded includes-collapse-era inventory |
