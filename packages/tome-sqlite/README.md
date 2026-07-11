# tome-sqlite

SQLite graph database used as the query cache (`TomeQueryCache`). Opens via `createSqliteModule()` for config-driven hosts.

Content loaders and enum codecs are injected by the host — this package only stores and queries SQLite.

Agent notes: [`AGENTS.md`](./AGENTS.md).
