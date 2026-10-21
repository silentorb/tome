# Independent SQL database without the flat-file database

Status: open

## Intent

Support a use case where a non-flatfile store is the primary / authoritative design store, without requiring the Git-tracked flat-file content database.

## Notes

Near-term remote multi-user uses **Neo4j** as the authoritative graph ([multi-user.md](../docs/features/multi-user.md) **phase 7**, [neo4j-support.md](./neo4j-support.md)) — graph-native rather than SQL. This task remains for deployments that want a **SQL** primary store (or related investigations). Distinct from **local multi-user**, which still uses flatfile + ephemeral design SQLite while identity lives in **user corpora** (flatfile + ephemeral identity cache; durable bindings in text/nodes, not SQLite). PostgreSQL host wiring Q4 enables opt-in SoT-only `dataStores` sessions (no CacheSync); multi-corpus SoT and corpus migration remain — [postgresql-support.md](./postgresql-support.md).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [neo4j-support.md](./neo4j-support.md)
- [postgresql-support.md](./postgresql-support.md)
