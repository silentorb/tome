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
| Property columns | `id` / `is_archived` as columns; others via `json_extract(properties, '$.name')` |
| Edges (`schema.edges`) | `relationship_projections` with `source_node_id`, `target_node_id`, `type`, `properties` (`propertiesColumn`) |
| Traverse hop | Imp `association` + `direction` (0\|1) → `schema.edgeType` → `{associationId}:{direction}` for `relationship_projections.type` |
| Optional edge property filter | When `traverse.edge_property` + `edge_equals` are set: `json_extract(path_edges.properties, '$.{edge_property}') = edge_equals`. When `compileImpGraphToTomeSql` is called with workspace `schema`, enum literals in `edge_equals` (and in `equals` / ordering comparisons against enum columns) are encoded to cache indices via `encodePropertyLiteral` — same mapping as cache sync ([schema.md](./schema.md)). |

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

`projectionType(associationId, direction)` **must** return `{associationId}:{0|1}` matching Tome directed projection types used in `relationship_projections.type`. This encoding is a **storage/SQL boundary** concern — Imp graphs keep `association` and `direction` as separate values and must not store the colon-joined form.

### API

| Operation | Behavior |
| --- | --- |
| `compileImpGraphToTomeSql(graph, options?)` | `graphToKysely` + `compileSql` + live-nodes rewrite; optional `{ schema }` for enum literal encoding; optional `{ pageNodeId, corpus }` for pre-SQL `corpus` operators |
| `createTomeLiveNodesSchema(schema?)` | `RelationalSchema` with edges, `edgeType`, and optional `encodePropertyLiteral` |
| `createTomeImpRegistry()` | Standard Imp registry for Tome hosts |
| `tomeLiveNodesSchema` | Default schema without workspace enum binding |
| `applyLiveNodesConstraint(sql, parameters)` | Rewrite `FROM "nodes"` |

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
- Tests cover column mapping, live rewrite, `projectionType`, and `traverse` SQL joining `relationship_projections`.

## Implementation pointers

- Package: [`packages/tome-imp-sql`](../../packages/tome-imp-sql/)
- Imp pathing: [pathing.md](../../../imp-spec/docs/packages/imp-pathing/pathing.md)
- Imp SQL: [sql.md](../../../imp-spec/docs/packages/imp-sql/sql.md)
- Consumer: [tome-query.md](./tome-query.md)

## See also

- [tome-query.md](./tome-query.md)
- [tome-db.md](./tome-db.md)
- [extensions.md](./extensions.md)
