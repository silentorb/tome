# tome-imp-sql — agent notes

## What it is

Compile/schema binder from Imp graphs to Tome SQLite cache SQL. Owns `RelationalSchema` for `nodes` + `relationship_projections`, live-node rewrite, and the standard Imp registry (core + collection-transforms + pathing + Tome `corpus` + `hosts_projection`).

## Dependency rules

- Imp packages, plus `tome-flatfile` (schema helpers) and `tome-ontology` (hosts_projection type id for the editor catalog).
- **Do not** import `tome-db`, `tome-editor`, or `tome-query`.
- No mutations / sync / page assembly.

## Layout

| Path | Role |
| --- | --- |
| `src/schema.ts` | `tomeLiveNodesSchema`, column map, live rewrite, `projectionType` |
| `src/corpus.ts` | Tome `corpus` library + pre-SQL splice / id constraint |
| `src/hosts-projection.ts` | Tome `hosts_projection` NodeLibrary (node-filter editor catalog) |
| `src/registry.ts` | `createTomeImpRegistry` |
| `src/compile.ts` | `compileImpGraphToTomeSql` |
| `tests/` | Schema + traverse compile + registry catalog tests |

## Run

```bash
bun test   # from this package
```

## See also

- [tome-imp-sql.md](../../docs/features/tome-imp-sql.md)
- Imp [pathing.md](../../../imp-ts/docs/features/pathing.md) / [sql.md](../../../imp-ts/docs/features/sql.md)
