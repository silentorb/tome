# PostgreSQL support

Status: open (Base B2)

## Intent

Add PostgreSQL as a SQL backend for design corpus / specialty auth storage, implemented in the sibling `tome-postgres` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Packages and Postgres CI/runtime live under workbench mount `.mnt/tome-postgres` (optional). Heavy DB tests stay out of tome’s light weighted suite by default.

**Base B2 (current):** Sibling Bun workspace with `tome-postgres` (`openPostgresGraphStore` Queryable single SoT — canonical `relationship_records` + same-DB `relationship_projections` mirrors; core node/relationship CRUD + Imp `executeImp`; model-config / workspace documents in `model_documents`; archive file APIs flip `nodes.is_archived`; solo `"default"` corpus with stored workspace) and a thin `createPostgresModule` Imp/test pipe over the same tables. Binder: `tome-imp-postgres` (`compilePostgres`). **No full `TomeQueryCache` / CacheSync** — flatfile’s SQLite cache exists mainly for flatfile performance; Postgres does not inherit that dual-store model. Archive is a **flag**, not full editor lifecycle (hub membership + incident relationship archive). Live tests use Compose/CI `POSTGRES_URI`.

**Remaining:** Optional same-DB product query SQL (member pages, expression indexes, FTS) when a host needs those UX paths; host `dataStores` / editor wiring; true multi-corpus SoT; corpus migration. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

**Adapter family:** Prefer LCD uniformity with integrated SQLite and sibling Neo4j adapters when making significant fundamental changes — see [graph-store.md](../docs/features/graph-store.md).

## See also

- Sibling [tome-postgres](https://github.com/silentorb/tome-postgres) (when published; workbench `.mnt/tome-postgres`)
- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
