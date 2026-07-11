# tome-sqlite — agent notes

## What it is

SQLite graph database implementing `TomeQueryCache` / `TomeCacheModule` (used as the query cache today). No content-path coupling — callers inject a `RelationshipPropertyCodec` and optional `memberPerspectives` callback.

## Dependency rules

- May depend on `tome-graph-interfaces` and `tome-service-interfaces`
- Must **not** import content loaders, relationship-type registries, or enum codecs from `tome-db` / `tome-flatfile`

## Layout

| File | Contents |
| --- | --- |
| `src/graph.ts` | `GraphDatabase`, `relationshipId` |
| `src/schema.ts` | DDL + `SCHEMA_VERSION` |
| `src/schema-migrate.ts` | Schema migrations |
| `src/module.ts` | `createSqliteModule()` |
| `src/index.ts` | Public exports |

## Run / test

```bash
bun test   # from this package
```

## See also

- [tome-db.md](../../docs/features/tome-db.md) — storage and sync (canonical content still in store packages)
- `tome-service-interfaces` — `TomeQueryCache` / `TomeCacheModule` contracts
