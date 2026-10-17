# Independent SQL database without the flat-file database

Status: open

## Intent

Support a use case where SQL is the primary / authoritative design store, without requiring the Git-tracked flat-file content database.

## Notes

Aligns with remote multi-user **Postgres design schema** ([multi-user.md](../docs/features/multi-user.md) **phase 7**). Distinct from **local multi-user**, which still uses flatfile + ephemeral design SQLite while identity lives in **user corpora** (flatfile + ephemeral identity cache; durable bindings in text/nodes, not SQLite). May interact with [postgresql-support.md](./postgresql-support.md).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [tome-db.md](../docs/features/tome-db.md)
- [graph-store.md](../docs/features/graph-store.md)
- [postgresql-support.md](./postgresql-support.md)
