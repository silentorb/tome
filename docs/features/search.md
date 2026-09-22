# Search

## Summary

Node search (`GET /api/nodes/search`, Imp `type: "search"`) is provided by a **`searcher`** extension component. Host packages never hardcode a backend: configure which searcher is enabled in `content/model/extensions.json`. Indexing for FTS (and future Meilisearch) uses Imp **`sync.graph`** sinks registered as `dataStores`.

| Concern | Mechanism |
| --- | --- |
| Who answers queries | `kind: "searcher"` + `searcherModule` |
| Who maintains an FTS index | `dataStores` entry + `sync.graph` observe edges |

Shipped backends:

| Package | Role |
| --- | --- |
| `tome-search-like` | SQL `LIKE` only (title then body; SQL order; no TS relevance ranking) |
| `tome-search-sqlite` | SQLite FTS5 sink + searcher (default for workbench) |

Meilisearch is deferred — see [tasks/tome-meilisearch.md](../../tasks/tome-meilisearch.md).

## When to read this

- Adding or switching search backends
- Wiring FTS via Imp sync
- Understanding empty-query browse vs typed search

## Requirements

- **Zero** enabled searchers → non-empty queries return `{ results: [], searchAvailable: false }`; empty `q` still browses via title-ordered cache list.
- **Exactly one** enabled searcher → active; more than one fails at extension load.
- If the enabled searcher fails to open (missing FTS backend / `dbPath`), search is unavailable (`searchAvailable: false`); other extensions keep loading.
- Empty query is **browse**, not a searcher responsibility.
- LIKE and FTS must not post-filter/sort the corpus in TypeScript for correctness (presentation-only `matchPreview` enrichment is allowed).

## Behavior

```
extensions.json searcher
  → ExtensionServerRuntime opens TomeSearch
  → ComposedGraphStore.setSearch
  → Imp search / graph-services.search / HTTP
```

FTS indexing:

```
dataStores.fts (tome-search-sqlite)
  → SyncEndpoint.apply(SyncSignal)
  ← sync.graph marloth.observeOut → fts.observeIn
```

## Verification

- `bun run --filter tome-search-like test`
- `bun run --filter tome-search-sqlite test`
- Full suite: `bash scripts/run-in-tome.sh run test`

## See also

- [searchers.md](../extensions/searchers.md)
- [tome-sync.md](./tome-sync.md)
- [extensions.md](./extensions.md)
- [tome-editor.md](./tome-editor.md)
