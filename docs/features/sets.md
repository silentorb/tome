# Sets

## Summary

A **set** is a node that contains other nodes via a relationship type that carries the **`set` trait** in `associations.json`. Set semantics are orthogonal to any particular storage slug: Tome resolves set/member roles from traits and from **caller context** (usually `views.json`), not from a hard-coded membership composite on each type table.

| Concept | Role |
| --- | --- |
| **`set` trait** | Marks a relationship type as set containment (parent = set, child = member) |
| **`ordered` trait** | Optional; sequence key defaults to `order` on the edge |
| **Perspectives** | Exactly two **display labels** per relationship type; set-side vs member-side from trait indices |
| **Type table** | Set detected via `table-schemas.json` key (and related UI) |
| **Archive hub** | Set detected via `workspace.json` → `archiveNodeId` |

**Example (Marloth project relationship types — not Tome defaults):**

| Relationship type id | Perspective labels | Traits | Typical use |
| --- | --- | --- | --- |
| *(ULID)* | Members / Membership | `set` | Plain type tables, Archive |
| *(ULID)* | Ordered members / Ordered membership | `set`, `ordered` | Scenes, Parts, Products (sequence on `order`) |

There is **no `membershipComposite` field** on `table-schemas.json`. Which set relationship type applies for a node comes from **views / caller context** via `setRoleRelationshipTypeForNode` (view relationship type ULID for that node, else a sole set-trait registry fallback).

Peer relationship types (scene↔feature, etc.) remain on separate relationship type ids — see [tome-db.md](./tome-db.md).

## When to read this

Read this doc when your task involves:

- Type-table row membership (members of a type-table set)
- Archive hub membership
- Projection expansion for set-trait edges
- Querying members of a set or sets a node belongs to
- Distinguishing set containment from cross-entity relationship types

For design-domain meaning of types and sets, read [`/workspaces/marloth-story/docs/ontology.md`](../../marloth-story/docs/ontology.md) alongside this doc.

## Requirements

### Set trait and endpoint labels

Every relationship type in `associations.json` defines a `perspectives` **tuple of exactly two** display labels. Entries with `traits` including `set` (or `{ "key": "set", ... }`) are set relationship types. Directed cache identity is `relationshipTypeId:endpointIndex` (not the label text). Symmetric relationship types use the `symmetric` trait — do not infer symmetry from equal perspective titles.

**Example content record (Marloth set relationship type):**

```json
{
  "a": "<set-id>",
  "b": "<member-id>",
  "type": "<relationship-type-ulid>",
  "properties": { "priority": "High" }
}
```

Ordered sets use the same parent/child indices with an `order` property when the `ordered` trait applies.

- Endpoints `a` / `b` are an **ordered tuple**: meaning of each index is defined by the type's `perspectives` label pair. There is **no lexicographic sorting**.
- **No `directedFrom` field exists** — direction is derived from tuple position + endpoint index, not a stored flag.
- Row scalars for type tables live on edge `properties` (keys from `table-schemas.json`). Legacy `row_index` is not written or displayed.

### Role resolution (`setRoleRelationshipTypeForNode` / `setRoleProjectionTypesForNode`)

Primary resolvers:
- `setRoleRelationshipTypeForNode(nodeId, contentDir)` → set-trait relationship type ULID
- `setRoleProjectionTypesForNode(nodeId, contentDir)` → `[setProjection, memberProjection]` (`ULID:0` / `ULID:1`)

1. Collect set relationship types from `views.json` for that `nodeId`.
2. If any match, use the first and return its role projection pair.
3. Else fall back to the sole plain (non-ordered) set-trait composite, else the sole set-trait composite.
4. Else throw: the project must declare view context or a single set-trait relationship type.

Callers (database views, ordered collections, archive, node create) **must not** invent slug ids; they use these helpers (or an explicit relationship type / projection from a view payload).

### Projection expansion

Expansion always emits two projections for registered types:

| Endpoint | Projection |
| --- | --- |
| Index 0 | node at `a` → node at `b` with type `{relationshipTypeId}:0` |
| Index 1 | node at `b` → node at `a` with type `{relationshipTypeId}:1` |

There is **no `bidirectional` field** — the parser rejects any type that does not define exactly two perspectives. (An unregistered storage type falls back to a single defensive projection during sync, but registered types are always a pair.)

For Marloth set relationship types with labels `["Members", "Membership"]`: `(set)-[:{id}:0]->(member)` and `(member)-[:{id}:1]->(set)` from one content record.

### Set-kind interpretation

Set semantics are **orthogonal** to edge type. A set node carries interpretation via workspace config:

| Set kind | Detection | Member effect |
| --- | --- | --- |
| `type_table` | Node id key in `table-schemas.json` | Members table, Properties panel scalars, type filtering |
| `archive` | `nodeId === workspace.archiveNodeId` | Excluded from search/graph via `nodes.is_archived` |
| Future (tags, scope) | TBD (`sets.json` or node metadata) | Per-set filter rules |

### Query API

Helpers in `packages/tome-db/src/set-membership.ts` (trait-driven; no hard-coded relationship type names):

- `setMemberIds(db, setId)` — members of a set
- `memberSetIds(db, memberId)` — sets a member belongs to
- `setKindForNode(db, nodeId, contentDir)` — `"type_table" | "archive" | null`
- `isSetNode(db, nodeId, contentDir)`
- `findSetEdge(db, memberId, setId)` — edge for a member↔set pair
- `listSetMemberRowConnections(db, setId)` — edges normalized for type-table row building
- `setRoleProjectionTypesForNode(setId, contentDir)` — set/member directed projection types

**Cardinality** (1:N UI, schema rules) is enforced in UI and `schema.json` — not in storage or projection count. Data layer is M:N.

### Archive hub

Archive membership uses the same set-trait family as type tables (in Marloth: `member_of` edges to the Archive hub). Archiving:

1. Marks incident relationships `archived: true` in content
2. Adds hub set edge (set at parent, member at child; no `archived` on hub edge)
3. Recomputes `nodes.is_archived` on sync

### Link vs create row

Linking or creating a type-table row **must** use the set relationship type resolved for that set (`setRoleRelationshipTypeForNode` / view context). Plain tables get no placement metadata. Ordered tables auto-stamp `order` when missing (`ordered-relationships.ts`).

Removing a Members-table row **must** delete the stored set-trait edge between that member and the set. `listSetMemberRowConnections` lists members from **every** set-trait relationship type, while the view payload's `memberSidePerspective` is the **view-resolved** relationship type. When those differ (plain vs ordered, or an inverted tuple that makes an instance look like a set), unlink / move **must** still find and delete any set-trait relationship connecting the same pair rather than returning `not_found`.

### Node page sections

| Page kind | Set UI |
| --- | --- |
| **Set / type-table node** | Single members (or ordered-members) table section (`database` or `ordered-collection`) — full columns, tabs, editing via `getDatabaseViewDetail` |
| **Member instance node** | **Properties** panel in metadata (edge scalars) **and** one set-membership relation section below the markdown body |

The auto-generated inverse set-side relation section is **not** emitted on set pages — listing there uses the rich Members table only. The membership section header does **not** link to a single parent set (rows link to each parent).

## Design rationale

**Why dual projections without `directedFrom`?** Set containment is asymmetric in meaning (member belongs to set; set contains members) and that asymmetry is encoded by the **ordered tuple** plus the type's ordered perspectives — not by a stored direction flag.

**Why no `membershipComposite` on table schemas?** Which relationship type a set uses is a **project modeling** choice expressed in `associations.json` and selected by **views / caller context**. Wiring a composite id onto every type table duplicated that choice and hard-coded Marloth slugs into Tome.

**Why unify archive with type tables?** Both are “node belongs to set” with different set-kind behavior. Special-casing archive as a peer relationship type duplicated query paths.

## Behavior / pipeline

```mermaid
flowchart LR
  JSON["data/relationships/{shard}/{digest}.json"]
  REG["associations.json\nset trait + perspectives"]
  VIEWS["views.json\nset-side perspective"]
  EXP["expandRelationshipEntry"]
  PROJ["relationship_projections"]
  CTX["setRoleRelationshipTypeForNode"]

  JSON --> EXP
  REG --> EXP
  EXP --> PROJ
  VIEWS --> CTX
  REG --> CTX
```

1. Content write: `ContentStore.upsertRelationship` writes the ordered tuple for the chosen set relationship type (parent at set index, child at member index).
2. Sync: `expandRelationshipEntry` emits two projections from the relationship type's perspectives.
3. Query: type tables and Properties use trait-driven helpers / view perspectives — not a fixed slug.

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `content/data/relationships/{shard}/{digest}.json` | Canonical set edges (live tree) |
| `content/model/associations.json` | Set-trait relationship types and perspective labels |
| `content/model/table-schemas.json` | Type-table set detection, column defs (no membership composite field) |
| `content/model/views.json` | Set-side perspective / section config for Members tables |
| `content/model/workspace.json` | `archiveNodeId` for archive set detection |
| `packages/tome-db/src/set-membership.ts` | Set query API |
| `packages/tome-flatfile/src/association-traits.ts` | Set trait helpers (`setRoleRelationshipTypeForNode`, `setRoleIndices`, …) |
| `packages/tome-db/src/content/relationship-sync-expand.ts` | Perspective-based expansion |

## Migration

Historical scripts (marloth-story) and migrations that renamed `is_a` → `member_of`, reordered tuples, and moved archive off peer `includes` are complete for current corpora. New projects register their own set-trait relationship types; Tome does not require Marloth's `member_of` / `ordered_member_of` names.

**Invariants:**

- Every registered set-trait record → exactly 2 projections
- Archive hub edges use a set-trait relationship type (not a peer relationship type)
- Type-table pages show one Members table (not a duplicate auto relation section)

## Non-goals (future)

- **Multi-hop path semantics** — interpreting edge meaning from neighborhood paths (e.g. Types meta-set)
- Requiring a universal storage slug for all set edges across projects
- API-level schema enforcement of allowed edges

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `set-membership.ts` | `setMemberIds`, `memberSetIds`, `setKindForNode`, edge helpers |
| `association-traits.ts` | `setRoleRelationshipTypeForNode`, trait parsing, ordered property |
| `relationship-sync-expand.ts` | Perspective-count expansion |
| `database-view.ts` | Members table rows via resolved set perspective |
| `node-page-sections.ts` | Members table on set pages; Properties on instances |
| `archive-status.ts` / `node-lifecycle.ts` | Archive via set edge to hub |
| `relationship-link-mutations.ts` | Set edge creation; ordered `order` stamp when applicable |

## See also

- [tome-db.md](./tome-db.md) — property graph storage and sync
- [table-schemas.md](./table-schemas.md) — type-table columns
- [views.md](./views.md) — Members section tabs
- [schema.md](./schema.md) — relationship rules (peer relationship types)
- [table-presentation.md](./table-presentation.md) — scope tabs, row groups, and intrinsic sequence
- [`/workspaces/marloth-story/docs/ontology.md`](../../marloth-story/docs/ontology.md) — design domain model
