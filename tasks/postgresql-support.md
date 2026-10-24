# PostgreSQL support

Status: open (host wiring Q4)

## Intent

Add PostgreSQL as a SQL backend for design corpus / specialty auth storage, implemented in the sibling `tome-postgres` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Packages and Postgres CI/runtime live under workbench mount `.mnt/tome-postgres` (optional). Heavy DB tests stay out of tome’s light weighted suite by default.

**Host wiring Q4 (current):** `dataStores` are building blocks wired by Imp `sync.graph` — flatfile+SQLite is the preferred observe topology, not a hard-coded pair. Postgres SoT-only configs use `createPostgresStoreModule` + `createPostgresFtsModule` with no CacheSync and no FTS observe edges (same-DB index). Example: `packages/tome-server/config/tome-server.postgres.example.json` (`POSTGRES_URI`). Archive remains a **flag**, not full editor lifecycle; solo `"default"` corpus only. Thin cache stubs remain for some `TomeQueryCache` methods.

**Remaining:** true multi-corpus SoT; corpus migration. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

**Adapter family:** Prefer LCD uniformity with integrated SQLite and sibling Neo4j adapters when making significant fundamental changes — see [graph-store.md](../docs/features/graph-store.md).

## See also

- Sibling [tome-postgres](https://github.com/silentorb/tome-postgres) (when published; workbench `.mnt/tome-postgres`)
- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [search.md](../docs/features/search.md)
- [tome-sync.md](../docs/features/tome-sync.md)
- [independent-sql-database.md](./independent-sql-database.md)
