# PostgreSQL support

Status: open (FTS Q3)

## Intent

Add PostgreSQL as a SQL backend for design corpus / specialty auth storage, implemented in the sibling `tome-postgres` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Packages and Postgres CI/runtime live under workbench mount `.mnt/tome-postgres` (optional). Heavy DB tests stay out of tome’s light weighted suite by default.

**FTS Q3 (current):** Same-DB product windows + expression indexes on the thin `TomeQueryCache` pipe, plus **same-DB content FTS** (`nodes.search_vector` + GIN, `openPostgresFtsSearch` → `TomeSearchBackend` without sync). Shared search LCD in `tome-interfaces/search`; sync contracts in `tome-service-interfaces/sync`; optional sync-fed indexing on FTS opens (SQLite keeps `syncEndpoint`; Postgres omits it). Base remains Queryable single SoT with model documents, archive flags, solo `"default"` corpus. **No full `TomeQueryCache` / CacheSync**; archive is still a **flag**, not full editor lifecycle. Live tests use Compose/CI `POSTGRES_URI`.

**Remaining:** host `dataStores` / editor wiring; true multi-corpus SoT; corpus migration. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

**Adapter family:** Prefer LCD uniformity with integrated SQLite and sibling Neo4j adapters when making significant fundamental changes — see [graph-store.md](../docs/features/graph-store.md).

## See also

- Sibling [tome-postgres](https://github.com/silentorb/tome-postgres) (when published; workbench `.mnt/tome-postgres`)
- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [search.md](../docs/features/search.md)
- [independent-sql-database.md](./independent-sql-database.md)
