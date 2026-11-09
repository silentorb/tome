# tome-mir

Imp **sync fabric** for Tome’s Mir-style multi-store observe wiring: `tome.sync.*` node catalog, handle-free store registry, `wireSyncGraph` / default graphs, `publishMutation`, and opaque-id partial scopes.

Does not open stores, run CacheSync, map flatfile paths, or watch git — those stay in `tome-db` (`tome-db/sync-session`). Sync contracts (`SyncEndpoint`, `SyncSignal`, scopes) live in `tome-service-interfaces/sync`.

Feature spec: [`docs/features/tome-sync.md`](../../docs/features/tome-sync.md). Agent notes: [`AGENTS.md`](./AGENTS.md).
