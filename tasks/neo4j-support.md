# Neo4j support

Status: open

## Intent

Add Neo4j as the supported remote authoritative graph backend for design corpora (and separate identity graphs for user corpora), implemented in the sibling `tome-neo4j` repo as store modules that depend on Tome interfaces — not the reverse.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 7 — Neo4j** — Neo4j **design/corpus** graph (design graph only) plus **identity** graph(s) for user corpora (Account/role nodes) and a remote **auth specialty store** as needed. Do not put Account/auth specialty data in the design graph. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

Packages and Neo4j Community CI/runtime live under workbench mount `.mnt/tome-neo4j` (optional). Heavy DB tests stay out of tome’s light weighted suite by default. PostgreSQL remains optional / much later — [postgresql-support.md](./postgresql-support.md).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
- [postgresql-support.md](./postgresql-support.md)
