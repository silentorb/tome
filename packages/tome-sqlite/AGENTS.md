# tome-sqlite — agent notes

## What it is

SQLite graph database implementing `TomeQueryCache` / `TomeCacheModule` (used as the **query cache** today). No content-path coupling — callers inject a `RelationshipPropertyCodec` and optional `memberPerspectives` callback.

**Target role:** canonical-capable SQL store aligned with Postgres SoT (property bags, model_documents) — design only so far; see [`docs/features/sql-graph-store.md`](../../docs/features/sql-graph-store.md). Until that migration, the EAV + promoted-column rules below still apply to running code.

## Dependency rules

- May depend on `tome-graph-interfaces`, `tome-service-interfaces`, and `tome-sql` (membership Analyze/Plan)
- Must **not** import content loaders, relationship-type registries, or enum codecs from `tome-db` / `tome-flatfile`

## Layout

| File | Contents |
| --- | --- |
| `src/graph.ts` | `GraphDatabase`, `relationshipId` |
| `src/membership-query/` | SQLite Bind/Emit + `compileMemberPage` (Analyze/Plan from `tome-sql`) |
| `src/schema.ts` | DDL + `SCHEMA_VERSION` (nodes + relationships: promoted columns + EAV; no JSON property bags) |
| `src/schema-migrate.ts` | Schema migrations |
| `src/module.ts` | `createSqliteModule()` |
| `src/index.ts` | Public exports |

## SQL schema — no JSON bag columns by default (cache schema)

**Default for today’s cache DDL:** do **not** introduce new SQLite columns (or whole-row fields) that store structured application data as a JSON blob/bag.

**SoT alignment exception:** the approved target schema in [`docs/features/sql-graph-store.md`](../../docs/features/sql-graph-store.md) **does** use JSON text property bags (Postgres `JSONB` analogue). Do not implement that migration casually from this package note — follow a dedicated schema plan. Until then, keep EAV + promoted columns.

**Other exceptions:** only when the user explicitly requests or approves that design in the same task (opaque nested payloads with no stable keys worth promoting).

**Not a good case on the cache schema:** key/value maps with known or semi-stable keys. Prefer real columns for hot keys + EAV for the long tail.

**Clarification:** EAV `value` cells may still be JSON-encoded individual `PropertyValue`s (as `node_properties` and `relationship_*_properties` do). That is scalar/value encoding, not a JSON bag column for the whole map.

## Run / test

```bash
bun test   # from this package
```

## See also

- [sql-graph-store.md](../../docs/features/sql-graph-store.md) — SQLite as canonical candidate (design)
- [tome-db.md](../../docs/features/tome-db.md) — storage and sync (canonical content still in store packages today)
- `tome-service-interfaces` — `TomeQueryCache` / `TomeCacheModule` contracts
