# tome-ontology — agent notes

**Feature spec:** [`docs/features/ontology.md`](../../docs/features/ontology.md)

## Scope

Store-independent **Tome ontology runtime**: predicates, patterns, trait/constraint query, and compilers from authored config into that runtime.

- Depends on `tome-graph-interfaces` only among Tome packages.
- No filesystem, SQLite, or HTTP.
- Not SQLite cache DDL (`SCHEMA_VERSION`).
- Not flatfile parse/load of `associations.json` — that stays in `tome-flatfile`; flatfile calls `compileAssociationConfig` after load.

## Exports (Plan 1)

- Types: `Predicate`, `Pattern`, `RelationshipRuntime`, `PatternMatchContext`
- `compileAssociationConfig(file)` — associations.json shape → runtime
- Query: `patternsMatching`, `traitMapFor`, `hasTrait`, `typesWithTrait`, set/ordered/symmetric helpers, endpoint constraints

## Run

```bash
bun test
```
