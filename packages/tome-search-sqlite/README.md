# tome-search-sqlite

SQLite **FTS5** search backend and sync sink for `dataStores` (`createSearchSqliteModule`).

Maintains a separate FTS database fed by Imp observe edges (`SyncEndpoint`), and exposes `TomeSearch` for the editor/API.

Feature spec: [`docs/features/search.md`](../../docs/features/search.md).
