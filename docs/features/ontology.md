# Ontology runtime (predicates + patterns)

## Summary

Tome’s corpus model is an **ontology**: semantic-driven configuration of relationship meaning, traits, and constraints. Package [`tome-ontology`](../../packages/tome-ontology/) holds a store-independent **relationship runtime** (predicates + patterns).

That runtime is compiled from:

1. **`associations.json`** — legacy relationship-types file (unchanged on disk)
2. **Node-authored ontology** (optional) — declared via `ontology.json` and graph membership, with Imp **node-filter** selection logic on predicate nodes

## Schema vs ontology (terminology)

The terms are nearly synonymous and can describe the same composition, but **emphasis differs**:

| Term | Emphasis |
| --- | --- |
| **Schema** | Structure (shapes, columns, file layouts, DDL) |
| **Ontology** | Meaning / semantics (while still structured) |

Tome’s model configuration is **ontology-first** — semantics drive the design; structure serves those semantics. Prefer **ontology** in new agent and feature-doc prose for Tome modeling. The package name `tome-ontology` reflects that.

Do **not** mass-rename existing “schema” identifiers. Narrow uses remain valid:

| Still called “schema” | Meaning |
| --- | --- |
| `content/model/schema.json` | Workspace enums (+ legacy relationshipRules) — see [schema.md](./schema.md) |
| `table-schemas.json` | Type-table column defs — see [table-schemas.md](./table-schemas.md) |
| SQLite `SCHEMA_VERSION` | Cache DDL version in `tome-sqlite` |
| `GET /api/schema` | HTTP that returns `schema.json` |
| Imp path ontology | Token binding in [tome-imp-sql.md](./tome-imp-sql.md) (related, Imp-facing) |

Design-domain meaning of Marloth nodes (features, products, …) lives in the corpus [`docs/ontology.md`](../ontology.md) — that is a **domain** ontology doc, not this runtime package.

## Runtime model

| Concept | Role |
| --- | --- |
| **Predicate** | Edge-kind identity + display metadata (`id`, `perspectives`). Optional Imp **nodeFilter** (`node → boolean`). **No traits on the predicate.** |
| **Pattern** | Match scope + attached traits / `linkExisting` / endpoint constraints |
| **RelationshipRuntime** | `predicates` + `patterns` with query helpers |

Match context today is `{ predicateId }` (optional `endpointIndex` for link-existing). Richer specificity (type-pair / instance patterns) is reserved for later.

**Traits attach to patterns**, not to predicates. Set / ordered / symmetric behavior is discovered by matching patterns for a predicate id.

## Config sources

### associations.json

`compileAssociationConfig(file)`:

1. For each `[id, def]` in `file.relationshipTypes`, emit predicate `{ id, perspectives }`.
2. Emit one pattern `{ id: "ac:"+id, match: { predicateId: id }, traits, linkExisting, endpoints }` from the same entry.

Flatfile loads associations (`loadRelationshipTypesFromContent`) and caches the compiled runtime (`loadRelationshipRuntimeFromContent`).

### ontology.json (node-authored)

Optional file: `content/model/ontology.json`

```json
{
  "version": 1,
  "types": {
    "ontology": "<ontology-type-node-ulid>",
    "predicate": "<predicate-type-node-ulid>",
    "memberScope": "<member-scope-type-node-ulid>"
  }
}
```

| Field | Meaning |
| --- | --- |
| `types.ontology` | Type-table node whose **members** are ontology instances |
| `types.predicate` | Type-table node whose **members** are predicate instances |
| `types.memberScope` | Type-table node whose **members** are member-scope instances (optional) |

**Taxonomy is relational** (not frontmatter markers):

| Kind | Qualification |
| --- | --- |
| Ontology instance | Member of `types.ontology` (set-trait membership) |
| Predicate instance | Member of `types.predicate` |
| **Active** predicate | Predicate instance **and** member of ≥1 ontology instance |
| Member-scope instance | Member of `types.memberScope` |
| **Active** member-scope | Member-scope instance **and** member of ≥1 ontology instance, with a valid binding payload |

Set-trait relationship types still come from `associations.json` (bootstrap / chicken-egg until typing can be expressed as node-native patterns).

### Imp node-filter structured properties

Active predicate nodes carry selection logic as a fenced structured body property:

- Fence language: `json`
- Info string: `{#predicate type="node-filter"}`
- Body: **raw Imp Graph JSON** (canonical on disk / for agents; not a React Flow envelope)
- Property key `predicate` means conceptually `node.predicate`

Optional `{#id}` on page-block meta is the general structured-property convention — see [page-blocks.md](../extensions/page-blocks.md).

**Editor UI:** [`tome-ontology-ui`](../../packages/tome-ontology-ui/) registers the interactive `node-filter` page block. Authors edit the filter in the host tool panel via shared [`tome-react-flow`](../../packages/tome-react-flow/) (`ImpFlowEditor`); save converts React Flow → Imp so the fence body stays raw Imp. Static HTML shows a short summary (not a full canvas).

Predicates without a valid `node-filter` property are skipped (not active in the runtime).

**Production evaluation (tome-db):** node-filters are evaluated for hub Members, type resolution, and typed pickers. Supported shapes today:

| Shape | Meaning |
| --- | --- |
| Boolean literal | Constant true/false |
| `hosts_projection` | Nodes that are **sources** of `{relationshipTypeId}:{direction}` (Tome convention; not Imp catalog). Used for Inspiration membership. |

### Member-scope instances

A **member-scope** binds a type-table hub to a predicate that selects its members (instead of—or in addition to—set-trait edges for listing / type checks). Authored on the member-scope node:

```json {#memberScope type="member-scope"}
{
  "typeTableId": "<type-table-hub-ulid>",
  "predicateId": "<predicate-node-ulid>"
}
```

Runtime: `loadMemberScopesFromContent` → hub Members / `typeIdsForInstance` / Inspired-by pickers resolve members via the linked predicate. Set-membership edges may still carry row scalars when present.

### Merge and site scope

1. Compile associations → base runtime
2. Discover/compile active node predicates → overlay (**node wins** on same predicate id)
3. A site / composite session **unions** contributions from each corpus’s `ontology.json` + graph (solo corpus is the trivial case)

`workspace.json` is unchanged; a future `corpus.json` for non-ontology corpus identity is deferred.

## Package layout

| Package | Owns |
| --- | --- |
| `tome-ontology` | Runtime types, match/query, `compileAssociationConfig`, `compileNodePredicates`, merge. **Keep dependencies minimal** (no React / React Flow / page-block hosts). Deepens semantic interpretation but is **optional** — Tome can run with minimal structure and minimal interpretation of relationship semantics without this package. |
| `tome-ontology-ui` | Client viewing/editing (interactive `node-filter` page block; future ontology UI). Depends on `tome-ontology` + `tome-react-flow`. Never the reverse. |
| `tome-flatfile` | associations + ontology.json I/O; discovery; mtime-cached runtime load |
| `tome-interfaces` | Page-block fence parse including optional `{#id}` |
| `tome-db` | Domain use + sync invalidation when ontology config / membership / filter bodies change |

Storage/editor/server hosts must not hard-require `tome-ontology` or `tome-ontology-ui` for a basic boot.

## Sync / invalidation

Invalidating the relationship-types runtime cache also covers node ontology overlay. Triggers include `associations.json`, `ontology.json`, set-membership relationship changes (when ontology types are configured), and predicate node body edits (when ontology types are configured).

## See also

- [sets.md](./sets.md) — set trait behavior (resolved via patterns)
- [schema.md](./schema.md) — workspace `schema.json` enums
- [tome-db.md](./tome-db.md)
- Package notes: [`packages/tome-ontology/AGENTS.md`](../../packages/tome-ontology/AGENTS.md), [`packages/tome-ontology-ui/AGENTS.md`](../../packages/tome-ontology-ui/AGENTS.md)
- Shared Imp canvas: [`packages/tome-react-flow/AGENTS.md`](../../packages/tome-react-flow/AGENTS.md)
