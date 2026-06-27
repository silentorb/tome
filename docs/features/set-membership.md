# Set membership

## Summary

Set membership is one of two **relationship families** in the Tome property graph. A membership edge links a **set node** (type table, Archive hub, future tag/scope sets) to a **member node**. Storage uses composite type `is_a` with asymmetric **perspectives**: `is_a` from the member, `members` from the set.

Peer **association** (scene↔feature, etc.) remains on the separate `includes` family — see [tome-db.md](./tome-db.md).

## When to read this

Read this doc when your task involves:

- Type-table row membership (`is_a` / `members`)
- Archive hub membership (migrated from legacy `includes`)
- Projection expansion for membership edges
- Querying members of a set or sets a node belongs to
- Distinguishing set membership from cross-entity association

For design-domain meaning of types and sets, read [`../ontology.md`](../../marloth-story/docs/ontology.md) alongside this doc.

## Requirements

### Two relationship families

| Family | Storage type | Perspectives | Examples |
| --- | --- | --- | --- |
| **Set membership** | `is_a` | `["is_a", "members"]` | Features row, Themes row, Archive member |
| **Peer association** | `includes` (+ named composites) | `["includes", "includes"]` or distinct pair | Scene↔Feature, taxonomy↔Inspiration |

### Content record shape (membership)

```json
{
  "a": "<sorted-smaller-id>",
  "b": "<sorted-smaller-id>",
  "type": "is_a",
  "properties": { "view": "All", "row_index": 3 }
}
```

- Endpoints `a` / `b` **must** be sorted lexicographically.
- **`directedFrom` must not** appear on membership records — direction is expressed by perspective at query time.
- Row scalars for type tables live on edge `properties` (keys from `table-schemas.json`).

### Projection expansion

Expansion is driven solely by `perspectives.length` in `relationship-types.json`:

| `perspectives.length` | Projections |
| --- | --- |
| ≥ 2 | Index 0: `a → b` with `perspectives[0]`; index 1: `b → a` with `perspectives[1]` |
| 1 | Single projection `a → b` with `perspectives[0]` |

The legacy `bidirectional` flag is **deprecated** — parsers may ignore it; expansion uses perspective count only.

For `is_a`: `(member)-[:is_a]->(set)` and `(set)-[:members]->(member)` from one content record.

### Set-kind interpretation

Set semantics are **orthogonal** to edge type. A set node carries interpretation via workspace config:

| Set kind | Detection | Member effect |
| --- | --- | --- |
| `type_table` | Node id key in `table-schemas.json` | Row listing, Properties panel scalars, type filtering |
| `archive` | `nodeId === workspace.archiveNodeId` | Excluded from search/graph via `nodes.is_archived` |
| Future (tags, scope) | TBD (`sets.json` or node metadata) | Per-set filter rules |

### Query API

Primary helper: `listSetMembership(db, nodeId, perspective)` where `perspective` is `"is_a"` or `"members"`.

- `"is_a"`: outgoing projections from `nodeId` (member → set)
- `"members"`: outgoing projections from `nodeId` (set → member)

Higher-level helpers:

- `setMemberIds(db, setId)` — members of a set
- `memberSetIds(db, memberId)` — sets a member belongs to
- `setKindForNode(db, nodeId, contentDir)` — `"type_table" | "archive" | null`

**Cardinality** (1:N UI, schema rules) is enforced in UI and `schema.json` — not in storage or projection count. Data layer is M:N.

### Archive membership

After migration, archive membership uses `is_a` edges to the Archive hub (same family as type tables). Archiving:

1. Marks incident relationships `archived: true` in content
2. Adds hub membership edge `(member)-[:is_a]->(archive)` (no `archived` on hub edge)
3. Recomputes `nodes.is_archived` on sync

### Link vs create row

Linking an existing node to a type table via `linkOutgoingRelationship` **must** stamp `view` and `row_index` on the membership edge (same as `createNode` with `kind: "database-row"`).

## Design rationale

**Why dual projections without `directedFrom`?** Membership is asymmetric in meaning (member belongs to set; set contains members) but symmetric in storage (sorted endpoints). Perspectives encode the asymmetry; queries use `listRelationshipsFromSource` with the appropriate perspective slug.

**Why unify archive with type tables?** Both are “node belongs to set” with different set-kind behavior. Special-casing archive as `includes` duplicated query paths and collided semantically with peer association.

**Why keep `is_a` as storage slug?** Minimizes content migration churn; display labels can evolve (`member_of` rename is a future ontology pass).

## Behavior / pipeline

```mermaid
flowchart LR
  JSON["relationships.json\n{a,b,type,properties}"]
  REG["relationship-types.json\nperspectives array"]
  EXP["expandRelationshipEntry"]
  PROJ["relationship_projections"]

  JSON --> EXP
  REG --> EXP
  EXP --> PROJ
```

1. Content write: `ContentStore.upsertRelationship` writes sorted `{a,b,type,is_a,properties}` without `directedFrom`.
2. Sync: `expandRelationshipEntry` emits two projections for `is_a`.
3. Query: type tables use `listSetMembership(setId, "members")`; instance pages use `listSetMembership(instanceId, "is_a")`.

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `content/data/relationships.json` | Canonical membership records |
| `content/model/relationship-types.json` | `is_a` perspectives `["is_a", "members"]` |
| `content/model/table-schemas.json` | Type-table set detection + column defs |
| `content/model/workspace.json` | `archiveNodeId` for archive set detection |
| `packages/tome-db/src/set-membership.ts` | Unified membership query API |
| `packages/tome-db/src/content/relationship-sync-expand.ts` | Perspective-based expansion |

## Migration

One-time script: `scripts/migrate-membership-projections.ts` (marloth-story):

1. Strip `directedFrom` from all `is_a` records
2. Convert archive hub `includes` → `is_a`
3. Backfill missing `view` / `row_index` on type-table membership edges where needed
4. Update `relationship-types.json` for dual `is_a` perspectives

**Invariants after migration:**

- Every `is_a` record → exactly 2 projections
- No archive-hub `includes` edges remain
- Archive member set equals pre-migration `listIncludesArchiveMemberIds`

## Non-goals (step 2+)

- **Multi-hop path semantics** — interpreting edge meaning from neighborhood paths (e.g. Types meta-set). Set nodes remain first-class; do not bake semantics into edge type slugs alone.
- Renaming storage type `is_a` → `membership`
- Renaming perspective `is_a` → `member_of`
- API-level schema enforcement of allowed edges

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `set-membership.ts` | `listSetMembership`, `setKindForNode`, member/set id helpers |
| `relationship-sync-expand.ts` | Perspective-count expansion |
| `database-view.ts` | Type-table rows via `members` perspective |
| `archive-status.ts` | Archive via membership to hub |
| `node-lifecycle.ts` | Archive/unarchive writes membership edges |
| `relationship-link-mutations.ts` | Row metadata on link-existing |

## See also

- [tome-db.md](./tome-db.md) — property graph storage and sync
- [table-schemas.md](./table-schemas.md) — type-table columns
- [schema.md](./schema.md) — relationship rules (peer association)
- [`../ontology.md`](../../marloth-story/docs/ontology.md) — design domain model
