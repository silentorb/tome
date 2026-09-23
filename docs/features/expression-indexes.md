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
- On relationship mutations, mark **matching** ready indexes **stale** via `expression_json.reachTypes` (IR reach + owner set-trait projections). Digests without `reachTypes` (legacy rows) match all types. Cache clears and node deletes still stale **all** ready indexes.
- When the mutation supplies endpoint ids, record them as `dirty_member_ids` and **incrementally patch** those members on the next ensure (upsert / delete). Full rebuild only when status is `missing`, dirty set is unknown (`NULL`), or a global clear ran.
- Concurrent ensures for the same digest are **single-flight** (sync Set; nested callers skip).
- Table `q` uses scoped `TomeSearch.searchWindow` (see [search.md](./search.md) and [views.md](./views.md)).
- Pure-SQL aggregate `ORDER BY` (like relation-counts) is a **later** follow-up — not required for this path.

## Code

| Area | Path |
| --- | --- |
| IR | `packages/tome-db/src/dynamic-properties/aggregate.ts` |
| Reach types | `packages/tome-db/src/dynamic-properties/expression-index-reach.ts` |
| Digest | `packages/tome-db/src/dynamic-properties/expression-index-key.ts` |
| Ensure / plan | `packages/tome-db/src/dynamic-properties/expression-index.ts` |
| Catalog DDL | `packages/tome-sqlite` schema v15 (`expression_indexes` + `dirty_member_ids`, `expression_index_values`) |
| Window ORDER BY | `SetMemberWindowQuery.expressionIndexSorts` |

## See also

- [dynamic-properties.md](./dynamic-properties.md)
- [views.md](./views.md) § Lazy-loaded rows
