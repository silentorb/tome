# PostgreSQL support

Status: open

## Intent

Add PostgreSQL as a supported SQL backend for the design corpus (authoritative remote store) alongside today’s SQLite cache path.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 7 — PostgreSQL** — Postgres **design/corpus schema** (design graph only) plus **identity schema(s)** for user corpora (Account/role nodes) and auth specialty tables. Do not put Account/auth tables in the design schema. Local MU prototyping uses separate design + identity SQLite first. See also [independent-sql-database.md](./independent-sql-database.md).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
