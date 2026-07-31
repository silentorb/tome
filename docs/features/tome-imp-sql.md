# tome-imp-sql

## Summary

**tome-imp-sql** binds Imp collection/path graphs to the Tome SQLite cache schema for SQL execution. It sits **above `tome-db`**: compile and schema mapping only — no content sync, mutations, or page assembly.

## When to read this

- Compiling Imp graphs against Tome `nodes` / `relationship_projections`
- Authoring `traverse` edgeType literals (association + direction)
- Wiring hosts such as `tome-query` to Imp → SQL

## Requirements

### Schema

| Relation | Mapping |
| --- | --- |
| Node collection (`schema.table`) | `nodes` |
| Property columns | `id` / `is_archived` as columns; others via `json_extract(properties, '$.name')` |
| Edges (`schema.edges`) | `relationship_projections` with `source_node_id`, `target_node_id`, `type` |

### Live nodes

Compiled SQL that selects from `"nodes"` **must** be rewritten so the base relation is live-only (`is_archived = 0`).

### Registry

`createTomeImpRegistry()` **must** load `imp.core`, `imp.collection.transforms`, and `imp.pathing`.

### Projection type helper

`projectionType(associationId, direction)` **must** return `{associationId}:{0|1}` matching Tome directed projection types used in `relationship_projections.type`.

### API

| Operation | Behavior |
| --- | --- |
| `compileImpGraphToTomeSql(graph)` | `graphToKysely` + `compileSql` + live-nodes rewrite |
| `createTomeImpRegistry()` | Standard Imp registry for Tome hosts |
| `tomeLiveNodesSchema` | `RelationalSchema` with edges |
| `applyLiveNodesConstraint(sql, parameters)` | Rewrite `FROM "nodes"` |

### Dependencies

Must not depend on `tome-db`. Hosts execute SQL via `queryAll` (or equivalent).

## Design rationale

- Keeps path/SQL binding out of core graph storage (`tome-db`).
- Reuses Imp’s catalog/lowerer split; Tome only supplies schema knowledge.
- Opaque Imp `edgeType` + local `projectionType` helper avoids baking association registries into Imp.

## Behavior / pipeline

1. Host builds an Imp graph (`input` → transforms / `traverse` → `output`).
2. `compileImpGraphToTomeSql` lowers with `tomeLiveNodesSchema`.
3. Host runs SQL via cache `queryAll`.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Binder contract |
| `packages/tome-imp-sql` | Implementation + tests |

## Quick start

```ts
import { compileImpGraphToTomeSql, projectionType } from "tome-imp-sql"

const edgeType = projectionType(associationId, 0)
const { sql, parameters } = compileImpGraphToTomeSql(graph)
```

## Configuration

None.

## Verification

- `bun run --filter tome-imp-sql test`
- Tests cover column mapping, live rewrite, `projectionType`, and `traverse` SQL joining `relationship_projections`.

## Implementation pointers

- Package: [`packages/tome-imp-sql`](../../packages/tome-imp-sql/)
- Imp pathing: [pathing.md](../../../imp/docs/features/pathing.md)
- Imp SQL: [sql.md](../../../imp/docs/features/sql.md)
- Consumer: [tome-query.md](./tome-query.md)

## See also

- [tome-query.md](./tome-query.md)
- [tome-db.md](./tome-db.md)
- [extensions.md](./extensions.md)
