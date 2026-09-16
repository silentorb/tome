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
| `src/schema.ts` | DDL + `SCHEMA_VERSION` (nodes + relationships: promoted columns + EAV; no JSON property bags) |
| `src/schema-migrate.ts` | Schema migrations |
| `src/module.ts` | `createSqliteModule()` |
| `src/index.ts` | Public exports |

## SQL schema — no JSON bag columns by default

**Default:** do **not** introduce new SQLite columns (or whole-row fields) that store structured application data as a JSON blob/bag.

**Exception:** only when the user explicitly requests or approves that design in the same task. Legitimate cases exist for truly opaque/open-ended nested payloads with no stable keys worth promoting.

**Not a good case:** key/value maps with known or semi-stable keys (historical node/relationship `properties` bags). Prefer real columns for hot keys + EAV for the long tail.

**Clarification:** EAV `value` cells may still be JSON-encoded individual `PropertyValue`s (as `node_properties` and `relationship_*_properties` do). That is scalar/value encoding, not a JSON bag column for the whole map.

## Run / test

```bash
bun test   # from this package
```

## See also

- [tome-db.md](../../docs/features/tome-db.md) — storage and sync (canonical content still in store packages)
- `tome-service-interfaces` — `TomeQueryCache` / `TomeCacheModule` contracts
