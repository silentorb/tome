# tome-imp-sql — agent notes

## What it is

Compile/schema binder from Imp graphs to Tome SQLite cache SQL. Owns `RelationalSchema` for `nodes` + `relationship_projections`, live-node rewrite, and the standard Imp registry (core + collection-transforms + pathing).

## Dependency rules

- Imp packages only among runtime deps.
- **Do not** import `tome-db`, `tome-editor`, or `tome-query`.
- No mutations / sync / page assembly.

## Layout

| Path | Role |
| --- | --- |
| `src/schema.ts` | `tomeLiveNodesSchema`, column map, live rewrite, `projectionType` |
| `src/corpus.ts` | Tome `corpus` library + pre-SQL splice / id constraint |
| `src/registry.ts` | `createTomeImpRegistry` |
| `src/compile.ts` | `compileImpGraphToTomeSql` |
| `tests/` | Schema + traverse compile tests |

## Run

```bash
bun test   # from this package
```

## See also

- [tome-imp-sql.md](../../docs/features/tome-imp-sql.md)
- Imp [pathing.md](../../../imp-ts/docs/features/pathing.md) / [sql.md](../../../imp-ts/docs/features/sql.md)
