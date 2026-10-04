# tome-ontology — agent notes

**Feature spec:** [`docs/features/ontology.md`](../../docs/features/ontology.md)

## Scope

Store-independent **Tome ontology runtime**: predicates, patterns, trait/constraint query, and compilers from authored config into that runtime.

- Depends on `tome-graph-interfaces` only among Tome packages.
- No filesystem, SQLite, or HTTP.
- Not SQLite cache DDL (`SCHEMA_VERSION`).
- Not flatfile parse/load of `associations.json` / `ontology.json` — that stays in `tome-flatfile`; flatfile calls compilers after load/discovery.

## Exports

- Types: `Predicate` (optional `nodeFilter`), `Pattern`, `RelationshipRuntime`, `PatternMatchContext`
- `compileAssociationConfig(file)` — associations.json shape → runtime
- `compileNodePredicates(inputs)` / `mergeRelationshipRuntimes` — node-authored overlay
- `predicateSelectsNode(runtime, id, nodeId, evaluate)` — runs Imp filter via caller-supplied evaluator
- Query: `patternsMatching`, `traitMapFor`, `hasTrait`, `typesWithTrait`, set/ordered/symmetric helpers, endpoint constraints

## Run

```bash
bun test
```
