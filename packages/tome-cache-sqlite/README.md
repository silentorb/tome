# tome-cache-sqlite

SQLite query-cache implementation of `TomeQueryCache`. Opens via `createSqliteCacheModule()` for config-driven hosts.

Content loaders and enum codecs are injected by the host — this package only stores and queries the cache.

Agent notes: [`AGENTS.md`](./AGENTS.md).
