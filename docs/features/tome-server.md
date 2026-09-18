# Tome server

## Summary

**tome-server** is the process **host** for the design graph: it loads a singular **data store** and **query cache** from JSON config, wires them through `tome-db` into `TomeGraphServices`, then starts **zero or more** **service modules** (default: `tome-http`). The editor webview is a client of the HTTP service, not part of this package.

The store module remains singular, but flatfile may open **one corpus** (`contentPath` / `TOME_CONTENT_PATH`) or a **composite of corpora** (`store.options.corpora` / `TOME_CORPORA`) — see [`multi-corpus.md`](./multi-corpus.md). Mixed sessions must use a dedicated session `TOME_DB_PATH`, not any corpus’s own SQLite cache.

## When to read this

- Running or configuring the API without the editor UI
- Adding a new service module (protocol adapter)
- Understanding how store/cache/HTTP plug in without being production dependencies of `tome-server`

## Package graph

| Package | Role |
| --- | --- |
| `tome-graph-interfaces` | Domain DTOs + `TomeGraphServices` |
| `tome-service-interfaces` | Store/cache/service module contracts |
| `tome-flatfile` | Flatfile `TomeDataStore` (owns change watching) |
| `tome-sqlite` | SQLite `TomeQueryCache` |
| `tome-db` | Domain queries/mutations + content↔cache sync |
| `tome-http` | Implements `TomeServiceModule`; HTTP routes + client SDK |
| `tome-server` | Config loader, infrastructure + graph wiring, starts services |
| `tome-editor` | Browser UI only |

**Do not** import `tome-http`, `tome-flatfile`, or `tome-sqlite` from `tome-server` production sources — load them via config `dynamic import`. Tests may use `devDependency` entries.

## Config

File: `packages/tome-server/config/tome-server.json` (override with `TOME_SERVER_CONFIG`).

```json
{
  "version": 1,
  "store": {
    "id": "flatfile",
    "module": "tome-flatfile",
    "export": "createFlatfileModule",
    "options": {}
  },
  "cache": {
    "id": "sqlite",
    "module": "tome-sqlite",
    "export": "createSqliteModule",
    "options": {}
  },
  "services": [
    {
      "id": "http",
      "module": "tome-http",
      "export": "createTomeHttpService",
      "options": { "port": 3847 }
    }
  ]
}
```

- **`store` and `cache` are required** (singular each). The store may still front multiple corpora via composite options.
- `services` may be **empty**: the host logs a warning and stays up.
- Multiple services are allowed (each typically binds its own port in v1).
- Path defaults (`TOME_CONTENT_PATH`, `TOME_DB_PATH`) are merged into module options by the host when omitted. Pass `corpora` in `store.options` (or `TOME_CORPORA`) for a multi-corpus session.

Bootstrap order: open store → open cache (with enum codec + set perspectives from content) → open graph services **without** blocking sync or file watchers → **start service modules (HTTP binds)** → run `CacheSync.ensureReadyAsync()` (cooperative; emits `[tome-sync]` progress on stderr and updates the sync status tracker) → mark ready, subscribe store→cache, `startWatching()`.

While syncing, `/api/health` reports `ready: false` / `syncing: true` with optional numeric `progress`; other API routes return **503** `cache_syncing`. After sync completes, health reports `ready: true` and data routes work normally. See [tome-db.md](./tome-db.md) § Cache sync at startup.

Startup logs: `[tome-server]` path/config lines, `Tome API listening on …` (may appear **before** sync finishes), then `[tome-sync]` phase progress, then `[tome-server] graph ready (…ms)`.

## Run

```bash
bun run server:dev
# alias: bun run editor:api
```

Requires `TOME_CONTENT_PATH` (and usually a populated content tree). Historical env: `TOME_EDITOR_API_PORT` still overrides the HTTP port when config omits `options.port`.

## Request / SQL profiling (opt-in)

Default **off** (one boolean check per HTTP request and `queryAll`; no timers when disabled).

| Knob | Purpose |
| --- | --- |
| `TOME_PROFILING=1` | Enable slow-sample capture (HTTP + SQL) |
| `TOME_PROFILING=verbose` | Record every timed sample, not only slow ones |
| `TOME_PROFILING_SLOW_MS` | Threshold in ms (default **100**) |
| `TOME_PROFILING_DB_PATH` | Profiling SQLite path (default: sibling `tome-profiling.sqlite` next to the cache DB) |
| `TOME_PROFILING_LOG=1` | Mirror samples to stderr (default **off**) |
| `TOME_PROFILING_MAX_MB` | Soft retention ceiling in MB (default **32**; converted to a row cap via ~512 B/sample) |
| `TOME_PROFILING_BATCH_DELETE_MB` | Oldest-sample batch to delete when over the ceiling (default **4**) |
| `services[].options.profiling` | `true` or `"verbose"` in `tome-server.json` |
| `services[].options.slowMs` | Same threshold via config |

When enabled:

- Samples are appended to a dedicated SQLite file (`samples` table: `id`, `at`, `kind`, `ms`, `detail`), not an in-memory ring.
- When the row ceiling is exceeded, the oldest **batch** of rows is deleted in one statement (not one delete per write).
- Samples are **not** logged to stderr unless `TOME_PROFILING_LOG` is set.
- `GET /api/debug/profiling` returns `{ config, dbPath }` (`config` includes `maxMb`, `batchDeleteMb`, derived `maxRows` / `batchDeleteRows`, `slowMs`, `verbose`, …). **404** when profiling is off.
- `POST /api/debug/profiling/execute-imp` with `{ graph }` runs an Imp collection query via `imp-sql` against the profiling DB (filter / sort / limit / project — no pathing). **404** when off.

Containers: pass env at runtime (no image rebuild). Workbench Compose forwards the `TOME_PROFILING*` vars into the `tome` service — see [container.md](./container.md).

## See also

- [`web-api-design.md`](./web-api-design.md) — application-specific HTTP use-case rules
- [`tome-editor.md`](./tome-editor.md) — client UI
- [`tome-db.md`](./tome-db.md) — domain + sync; store/cache packages
- [`extensions.md`](./extensions.md) — page-block extensions (server runtime in `tome-server`)
- [`multi-corpus.md`](./multi-corpus.md) — multiple content roots in one session
- [`container.md`](./container.md) — env vars including profiling
- [`graph-store.md`](./graph-store.md) — composed SQLite read path (nodes + relationships)
