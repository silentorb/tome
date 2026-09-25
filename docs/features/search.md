# Search

## Summary

Node search (`GET /api/nodes/search`, Imp `type: "search"`) and **editor table `q`** are provided by a **`searcher`** extension component. Host packages never hardcode a backend: configure which searcher is enabled in `content/model/extensions.json`. Indexing for FTS (and future Meilisearch) uses Imp **`sync.graph`** sinks registered as `dataStores`.

| Concern | Mechanism |
| --- | --- |
| Who answers queries | `kind: "searcher"` + `searcherModule` |
| Who maintains an FTS index | `dataStores` entry + `sync.graph` observe edges |
| Table utility-bar `q` | Same searcher via `searchWindow` + `allowedNodeIds` (set members / related / composed scope) |

Shipped backends:

| Package | Role |
| --- | --- |
| `tome-search-like` | SQL `LIKE` only (title then body; SQL order; no TS relevance ranking); implements `search` + `searchWindow` |
| `tome-search-sqlite` | SQLite FTS5 sink + searcher (default for workbench); implements `search` + `searchWindow` |

Meilisearch is deferred — see [tasks/tome-meilisearch.md](../../tasks/tome-meilisearch.md).

## When to read this

- Adding or switching search backends
- Wiring FTS via Imp sync
- Understanding empty-query browse vs typed search

## Requirements

- **Zero** enabled searchers → non-empty queries return `{ results: [], searchAvailable: false }`; empty `q` still browses via title-ordered cache list.
- **Exactly one** enabled searcher → active; more than one fails at extension load.
- If the enabled searcher fails to open (missing FTS backend / `dbPath`), search is unavailable (`searchAvailable: false`); other extensions keep loading.
- Empty query is **browse**, not a searcher responsibility. Editor `@` mentions use the same API: bare `@` browses; typing filters via the searcher — if search is unavailable the menu shows no matches after the first character.
- Host normalize **auto-injects** a `tome-search-sqlite` `dataStores` entry (`fts`) when none is configured, and the default sync graph (or `ensureFtsObserveEdges`) wires every flatfile corpus into that sink so FTS stays indexed without every host JSON listing it by hand.
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

### Table `q` vs Imp `search` vs Recent

| Concern | Treatment |
| --- | --- |
| Imp `type: "search"` | Collection **operator** (peer to filter/sort); host-delegated; generic Imp SQL does not lower it |
| Editor table `q` | Same searcher via `searchWindow`, but as a **prior query operator** in the [uniform window pipeline](./views.md) — not a peer “window mode” to SQL/`js` backends |
| Sidebar Recent | Separate Imp graph `recentNodesGraph` (`sort(modified_at)` → limit) via `GET /api/nodes/recent` — Imp→SQL, **not** membership/table windows |
| Empty global `q` | Title-ordered **browse** (`listRecentNodes`) — not the Recent sidebar |

**Paradigm flip:** LIKE search is primarily a **filter** (order secondary). Advanced text search (FTS / future) is primarily a **weighted sort**; non-matches or low scores are an optional **shelf** cutoff. Today’s searcher call still owns rank + page; membership SQL only hydrates by hit ids.

## Verification

- `bun run --filter tome-search-like test`
- `bun run --filter tome-search-sqlite test`
- Full suite: `bash scripts/run-in-tome.sh run test`

## See also

- [searchers.md](../extensions/searchers.md)
- [tome-sync.md](./tome-sync.md)
- [extensions.md](./extensions.md)
- [tome-editor.md](./tome-editor.md)
