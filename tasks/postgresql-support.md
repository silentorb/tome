# PostgreSQL support

Status: open

## Intent

Add PostgreSQL as a supported SQL backend for the design corpus (authoritative remote store) alongside today’s SQLite cache path.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 8** — Postgres **corpus schema** (graph only) plus a **separate Postgres user schema** for Account/auth-extension tables. Do not put user tables in the corpus schema. Local MU prototyping uses two SQLite files first. See also [independent-sql-database.md](./independent-sql-database.md).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
