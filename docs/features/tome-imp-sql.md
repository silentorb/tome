# tome-imp-sql

## Summary

**tome-imp-sql** binds Imp collection/path graphs to the Tome SQLite cache schema for SQL execution. It sits **above `tome-db`**: compile and schema mapping only — no content sync, mutations, or page assembly.

## When to read this

- Compiling Imp graphs against Tome `nodes` / `relationship_projections`
- Authoring `traverse` hops (`association` + `direction`)
- Wiring hosts such as `tome-query` to Imp → SQL

## Requirements

### Schema

| Relation | Mapping |
| --- | --- |
| Node collection (`schema.table`) | `nodes` |
| Property columns | `id` / `is_archived` / promoted fields (`title`, `alias`, `body`, `created_at`, `modified_at`) as columns; other names via `(SELECT json_extract(value, '$') FROM node_properties WHERE node_id = nodes.id AND key = '…')` |
| Traverse node bag | `nodePropertiesJson` rebuilds promoted fields via `json_object(...)` for edge `json_patch` (nodes no longer have a `properties` column) |
| Edges (`schema.edges`) | `relationship_projections` with `source_node_id`, `target_node_id`, `type`; promoted edge fields (`ordinal`, `order`, `priority`) as columns; other keys via `relationship_projection_properties` EAV (`schema.edges.property` / `propertiesJson`) |
| Traverse hop | Imp `association` + `direction` (0\|1) → `schema.edgeType` → `{associationId}:{direction}` for `relationship_projections.type` |
| Optional edge property filter | When `traverse.edge_property` + `edge_equals` are set: `schema.edges.property('path_edges', edge_property) = edge_equals` (promoted column or EAV subquery). When `compileImpGraphToTomeSql` is called with workspace `schema`, enum literals in `edge_equals` (and in `equals` / ordering comparisons against enum columns) are encoded to cache indices via `encodePropertyLiteral` — same mapping as cache sync ([schema.md](./schema.md)). |
| Traverse edge bag | `propertiesJson` rebuilds promoted edge columns + EAV via `json_object` / `json_group_object` for node↔edge `json_patch` (projections no longer have a `properties` column) |

### Enum property literals (Imp SQL compile)

Imp query graphs use **string labels** for enum property literals (e.g. `edge_equals: "Consideration"`, `equals` on a `priority` column). The SQLite cache stores enum values as **option indices** ([tome-db.md](./tome-db.md)).

Hosts executing against the Tome cache **must** pass `schema` from `content/model/schema.json`:

```ts
compileImpGraphToTomeSql(graph, { schema: loadSchemaFromContent(contentDir) })
```

`createTomeLiveNodesSchema(schema)` wires `RelationalSchema.encodePropertyLiteral` to the shared codec in `tome-flatfile/enum-property-codec` (same rules as cache `propertyCodec`). Without `schema`, literals bind unchanged (identity hook).

### Live nodes

- Compiled SQL that selects from `"nodes"` **must** be rewritten so the base relation is live-only (`is_archived = 0`). When a `corpus` operator resolved a corpus, the same subquery also constrains `"id"`.

### Registry

`createTomeImpRegistry()` **must** load `imp.core`, `imp.collection.transforms`, `imp.pathing`, and Tome `tome.corpus` (`corpus` operator).

### Corpus operator (pre-SQL)

`corpus` is **not** lowered by `imp-sql`. `compileImpGraphToTomeSql` splices it out, then applies the live-nodes rewrite plus optional `id IN (…)` from the host corpus map (`pageNodeId` + `corpus` lookup). Specs: `"page"` (page node’s corpus), a corpus slug, or `"all"` (no extra filter).

### Projection type helper

`projectionType(associationId, direction)` **must** return `{associationId}:{0|1}` matching Tome directed projection types used in `relationship_projections.type`. This encoding is a **storage/SQL boundary** concern — Imp graphs keep `association` and `direction` as separate values and **must not** store the colon-joined form. `edgeType` accepts bare association ids only (packed strings are rejected).

### Semantic paths (host PathOntology)

Ordinary relation→field hops **must** prefer Imp semantic bind over hand-wired `traverse` / `column` chains:

| Operation | Behavior |
| --- | --- |
| `createTomePathOntology(associations, tableSchemas)` | Type-scoped tokens from table-schema column keys + promoted node fields (`id`, `title`, …). Relation tokens bind to bare `association` + `endpoint` as direction and opposite endpoint `typeId` as `nextType`. Fails if a token maps to both property and relationship in one type. |
| `bindTomeSemanticPath(tokens, { ontology, startType, prefix, source, asScalar? })` | Resolve + desugar to `traverse` / `project` (wraps `imp-pathing` `bindSemanticPath`) |

Perspective display labels are **not** semantic tokens.

Editor **table-presentation** scope/group related-id reads resolve presentation composites to table-schema column keys, then use a **minimal** PathOntology for that hop plus `semanticPathFromAnchorGraph` + Queryable `executeImp` (see [table-presentation.md](./table-presentation.md), [graph-store.md](./graph-store.md)). Prefer that path over hand-wired `traverse` when only opposite node ids are needed. Hosts should not call `createTomePathOntology` over an entire corpus for these hops — unrelated relation columns without endpoint typeIds would fail integrity checks.

### API

| Operation | Behavior |
| --- | --- |
| `compileImpGraphToTomeSql(graph, options?)` | `graphToKysely` + `compileSql` + live-nodes rewrite; optional `{ schema }` for enum literal encoding; optional `{ pageNodeId, corpus }` for pre-SQL `corpus` operators |
| `createTomeLiveNodesSchema(schema?)` | `RelationalSchema` with edges, `edgeType`, and optional `encodePropertyLiteral` |
| `createTomeImpRegistry()` | Standard Imp registry for Tome hosts |
| `tomeLiveNodesSchema` | Default schema without workspace enum binding |
| `applyLiveNodesConstraint(sql, parameters)` | Rewrite `FROM "nodes"` |
| `createTomePathOntology` / `bindTomeSemanticPath` | Host semantic path bind (see above) |

### Dependencies

Must not depend on `tome-db`. Hosts execute SQL via `queryAll` (or equivalent).

## Design rationale

- Keeps path/SQL binding out of core graph storage (`tome-db`).
- Reuses Imp’s catalog/lowerer split; Tome only supplies schema knowledge.
- Imp graphs stay explicit (`association` / `direction`); Tome’s packed projection type string is produced only when binding to SQL.

## Behavior / pipeline

1. Host builds an Imp graph (`input` → transforms / `traverse` → `output`) with separate `association` and `direction` on each hop.
2. `compileImpGraphToTomeSql` lowers with `createTomeLiveNodesSchema(schema)` (composing projection types via `edgeType` and encoding enum literals when `schema` is supplied).
3. Host runs SQL via cache `queryAll`.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Binder contract |
| `packages/tome-imp-sql` | Implementation + tests |

### Collection ops (SQL path)

When query results come from the **SQLite / Imp SQL** database:

- **Must not** filter, sort, join, or group those collections in application TypeScript/JavaScript.
- Express filter / sort / join / group / `limit` / `offset` in Imp (or equivalent SQL on the cache); TS only hydrates DTOs from the result rows.
- **Flatfile** Imp execution is **exempt** — in-memory collection eval remains allowed there.

Editor table windows apply this rule with a **uniform window pipeline**: `explodeTableWindowRequest` separates `backend` (`sql` | `js`) from an optional **search operator** (`searchQuery` from table `q`). When search is present, a prior **TomeSearch** `searchWindow` (scoped to member/related node ids) supplies rank + shelf; the window step then hydrates by hit ids. When absent, SQL-expressible sorts (including **fixed and column-set dyn sorts** via expression indexes) use SQL windows. Flatfile remains exempt. Details: [views.md](./views.md) § Lazy-loaded rows; [search.md](./search.md); [dynamic-properties.md](./dynamic-properties.md) § Expression indexes.

**Items / database custom views** and **composed / generated presentations** use `listMemberPage` (and `listMemberPageNodeIds` for search scope / ids) — equivalent to Imp `sort` / `limit` / `offset`, not an extension of `typeMembersGraph` (which remains id-only for Imp consumers). Relation sections use `listRelationshipsFromSourceWindow` (default `ORDER BY` ordinal nulls-last then projection id; index `idx_rel_proj_source (source_node_id, type, ordinal, id)`), or `listRelationshipsFromSourceForTargetIds` after a search operator. Composed presentations also use `listDistinctSetMemberScopeIds` and `listComposedGroupHeaders` for scope tabs and group headers.

## Quick start

```ts
import { compileImpGraphToTomeSql } from "tome-imp-sql"

// traverse node inputs: { association: associationId, direction: 0 | 1 }
const { sql, parameters } = compileImpGraphToTomeSql(graph, {
  schema: loadSchemaFromContent(contentDir),
})
```

## Configuration

None.

## Verification

- `bun run --filter tome-imp-sql test`
- Tests cover column mapping, live rewrite, `projectionType`, bare-association `edgeType`, `traverse` SQL joining `relationship_projections`, and PathOntology bind/desugar.

## Implementation pointers

- Package: [`packages/tome-imp-sql`](../../packages/tome-imp-sql/)
- Imp pathing: [pathing.md](../../../imp-spec/docs/packages/imp-pathing/pathing.md)
- Imp SQL: [sql.md](../../../imp-ts/docs/features/sql.md)
- Consumer: [tome-query.md](./tome-query.md)

## See also

- [tome-query.md](./tome-query.md)
- [tome-db.md](./tome-db.md)
- [extensions.md](./extensions.md)
