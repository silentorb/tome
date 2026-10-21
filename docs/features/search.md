# Search

## Summary

Node search (`GET /api/nodes/search`, Imp `type: "search"`) and **editor table `q`** are provided by **`searcher`** extension components. Two **roles** share the same `TomeSearch` interface and can bind different implementations:

| Role | Surfaces | Typical backend |
| --- | --- | --- |
| `title` | `@` mentions, `RecordLinkPicker` (Relate / Move / Link existing / relation cells) | `tome-search-like` |
| `content` | Global search (Ctrl/Cmd+K), table utility-bar `q` | `tome-search-sqlite` (FTS5) |

Configure bindings in `content/model/extensions.json` via `search.title` / `search.content` (component ids).

Shared contracts live in `tome-interfaces/search`: `TomeSearch`, helpers (`buildSearchMatchPreview`, `resolveSearchWindowBounds`, …), and **`TomeSearchBackend`** (`search` + `close`, optional `syncEndpoint`). Sync contracts (`SyncEndpoint`, `SyncSignal`, …) live in `tome-service-interfaces/sync`. Sync-fed indexes set `syncEndpoint`; same-DB indexes omit it and observe-edge wiring degrades (skips those sinks).

| Concern | Mechanism |
| --- | --- |
| Who answers queries | `kind: "searcher"` + `searcherModule` + `search` role map |
| Who maintains a sync-fed FTS index | `dataStores` entry with `syncEndpoint` + `sync.graph` observe edges |
| Same-DB FTS (Postgres) | Generated `tsvector` on SoT `nodes`; no sync endpoint |
| Table utility-bar `q` | **Content** role via `searchWindow` + `allowedNodeIds` |

Shipped backends:

| Package | Behavior |
| --- | --- |
| `tome-search-like` | Title-only SQL `LIKE` filter; TS relevance order (exact → prefix → word-boundary → substring → shorter → localeCompare); `search` + `searchWindow` |
| `tome-search-sqlite` | SQLite FTS5 sync sink + searcher (`bm25` over title/alias/body); `TomeSearchBackend` with `syncEndpoint` |
| `tome-postgres` `createPostgresFtsModule` / `openPostgresFtsSearch` | Same-DB `tsvector` / `ts_rank_cd`; `TomeSearchBackend` without sync; load via `dataStores` (see `tome-server.postgres.example.json`) |

Meilisearch is deferred — see [tasks/tome-meilisearch.md](../../tasks/tome-meilisearch.md).

## When to read this

- Adding or switching search backends
- Binding title vs content roles
- Wiring FTS via Imp sync
- Understanding empty-query browse vs typed search

## Requirements

- **Zero** enabled searchers → non-empty queries return `{ results: [], searchAvailable: false }` for both roles; empty `q` still browses via title-ordered cache list.
- **Role map:** `extensions.json.search` maps `title` and `content` to enabled searcher component ids (same id may fill both). When `search` is omitted and exactly one searcher is enabled, both roles bind to it. Multiple enabled searchers without `search` fail at load.
- If a bound searcher fails to open (missing FTS backend / `dbPath`), that role is unavailable (`searchAvailable: false` for requests with that `role`); other extensions keep loading.
- Empty query is **browse**, not a searcher responsibility. Bare `@` / empty picker / empty global `q` browse by title; typed queries use the role’s searcher.
- Host normalize **auto-injects** a `tome-search-sqlite` `dataStores` entry (`fts`) for the preferred flatfile+sqlite topology when none is configured; the default sync graph (or `ensureFtsObserveEdges`) wires every flatfile corpus into sync-capable FTS sinks. SoT-only / same-DB FTS configs list their own search module and skip sqlite FTS inject.
- **Content / FTS** must not post-filter/sort the corpus in TypeScript for correctness (presentation-only `matchPreview` enrichment is allowed). **Title / LIKE** may rank title candidates in TypeScript after the SQL filter (intentional relevance).

## Behavior

```
extensions.json search.{title,content}
  → ExtensionServerRuntime opens TomeSearch per unique component
  → ComposedGraphStore.setSearchRoles
  → Imp search (searchRole) / graph-services.search / HTTP ?role=
```

HTTP: `GET /api/nodes/search?q=…&role=title|content` (default `content`). Response `searchAvailable` reflects that role.

Sync-fed FTS indexing (SQLite default path):

```
dataStores.fts (tome-search-sqlite)
  → SyncEndpoint.apply(SyncSignal)
  ← sync.graph marloth.observeOut → fts.observeIn
```

Same-DB Postgres FTS keeps the index warm via SoT node writes (`search_vector` generated column); hosts that only wire observe→fts skip backends without `syncEndpoint`.

### Table `q` vs Imp `search` vs Recent

| Concern | Treatment |
| --- | --- |
| Imp `type: "search"` | Collection **operator**; host-delegated; `ExecuteImpContext.searchRole` selects title or content |
| Editor table `q` | **Content** searcher via `searchWindow` as a **prior query operator** in the [uniform window pipeline](./views.md) |
| Sidebar Recent | Separate Imp graph `recentNodesGraph` (`sort(modified_at)` → limit) via `GET /api/nodes/recent` |
| Empty global / picker / `@` `q` | Title-ordered **browse** (`listRecentNodes`) — not the Recent sidebar |

**Paradigm:** Title search is a precise **filter + relevance sort** over titles. Content search (FTS / future) is primarily a **weighted sort** over indexed text; non-matches or low scores are an optional **shelf** cutoff. The searcher call owns rank + page; membership SQL only hydrates by hit ids.

## Verification

- `bun run --filter tome-search-like test`
- `bun run --filter tome-search-sqlite test`
- Full suite: `bash scripts/run-in-tome.sh run test`

## See also

- [searchers.md](../extensions/searchers.md)
- [tome-sync.md](./tome-sync.md)
- [extensions.md](./extensions.md)
- [tome-editor.md](./tome-editor.md)
