# PostgreSQL support

Status: deferred

## Intent

Optionally add PostgreSQL as a SQL backend for design corpus / specialty auth storage. **Not** the near-term remote path — Neo4j is primary ([neo4j-support.md](./neo4j-support.md)).

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). Phase 7 is **Neo4j**. A Postgres adapter may still be useful much later (e.g. specialty SQL or sites that prefer relational SoT). Do not prioritize this over Neo4j work. Local MU prototyping uses user-corpus **flatfile** (+ ephemeral design/identity SQLite caches) — not durable auth rows in SQLite; see [tome-db.md](../docs/features/tome-db.md) § Local SQLite is ephemeral-only.

## See also

- [neo4j-support.md](./neo4j-support.md)
- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [independent-sql-database.md](./independent-sql-database.md)
