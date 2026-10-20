# PostgreSQL support

Status: open (product query Q1)

## Intent

Add PostgreSQL as a SQL backend for design corpus / specialty auth storage, implemented in the sibling `tome-postgres` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Packages and Postgres CI/runtime live under workbench mount `.mnt/tome-postgres` (optional). Heavy DB tests stay out of tome’s light weighted suite by default.

**Product query Q1 (current):** Same-DB product windows on the thin `TomeQueryCache` pipe (`listMemberPage` / ids, relation windows + hydrate-by-targets, scope/header helpers, `listRelatedTargetNodeIds`). Dialect-neutral membership **Analyze** / **Plan** live in [`tome-sql`](../packages/tome-sql/); Postgres **Bind** / **Emit** use jsonb. Expression-index sorts refuse clearly (no expression-index tables yet). Base remains Queryable single SoT (`openPostgresGraphStore`) with model documents, archive flags, solo `"default"` corpus. **No full `TomeQueryCache` / CacheSync**; archive is still a **flag**, not full editor lifecycle. Live tests use Compose/CI `POSTGRES_URI`.

**Remaining:** Expression indexes (dyn sorts); FTS; host `dataStores` / editor wiring; true multi-corpus SoT; corpus migration. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

**Adapter family:** Prefer LCD uniformity with integrated SQLite and sibling Neo4j adapters when making significant fundamental changes — see [graph-store.md](../docs/features/graph-store.md).

## See also

- Sibling [tome-postgres](https://github.com/silentorb/tome-postgres) (when published; workbench `.mnt/tome-postgres`)
- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
