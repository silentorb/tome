# Expression indexes

## Summary

Content-addressed **sort indexes** in the SQLite query cache for expressions that Items tables need before `LIMIT` (fixed dynamic properties and dimension-expanded **column-set** keys). Primary path: registry/IR → digest → lazy-built `expression_index_values`. DynAggregate IR defines the metric; Imp subgraph hashing is the same key shape for a later slice.

## When to read this

- Fixed or column-set dyn sort performance / SQL windowing
- Adding a new dyn resolver that must be sortable under infinite scroll
- Invalidation of derived sort keys after graph sync

## Requirements

- Digest keys include canonical expression + context fingerprint (schema enum weights, associations, format version) — not `limit`/`offset`.
- For **column-set** sorts, the digest also binds **`dimensionId`** (parsed from the materialized column key) so each expanded column has its own index.
- Index tables live only in the query cache; never write computed dyn answers onto flatfile `IS_A` props.
- On relationship/node mutations, mark ready indexes **stale**; next Items sort rebuilds (v1 full rebuild).
- Table `q` stays on the legacy full-materialize path (next-level search hold).

## Code

| Area | Path |
| --- | --- |
| IR | `packages/tome-db/src/dynamic-properties/aggregate.ts` |
| Digest | `packages/tome-db/src/dynamic-properties/expression-index-key.ts` |
| Ensure / plan | `packages/tome-db/src/dynamic-properties/expression-index.ts` |
| Catalog DDL | `packages/tome-sqlite` schema v14 (`expression_indexes`, `expression_index_values`) |
| Window ORDER BY | `SetMemberWindowQuery.expressionIndexSorts` |

## See also

- [dynamic-properties.md](./dynamic-properties.md)
- [views.md](./views.md) § Lazy-loaded rows
