# PostgreSQL support

Status: open (scaffold)

## Intent

Add PostgreSQL as a SQL backend for design corpus / specialty auth storage, implemented in the sibling `tome-postgres` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Packages and Postgres CI/runtime live under workbench mount `.mnt/tome-postgres` (optional). Heavy DB tests stay out of tome’s light weighted suite by default.

**Scaffold (current):** Bun workspace with `tome-postgres` (`createPostgresModule` stub) and `tome-imp-postgres` (Imp → SQL against a provisional Postgres schema via `imp-sql`). Store CRUD / driver execution remain open. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

**Adapter family:** Prefer LCD uniformity with integrated SQLite and sibling Neo4j adapters when making significant fundamental changes — see [graph-store.md](../docs/features/graph-store.md).

## See also

- Sibling [tome-postgres](https://github.com/silentorb/tome-postgres) (when published; workbench `.mnt/tome-postgres`)
- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
