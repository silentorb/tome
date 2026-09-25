# Tome server

## Summary

**tome-server** is the process **host** for the design graph: it loads heterogeneous **`dataStores`** (flatfile corpora + sqlite cache) from JSON config, wires observer sync via Imp **`sync.graph`** (see [tome-sync.md](./tome-sync.md)), builds `TomeGraphServices` through `tome-db`, then starts **zero or more** **service modules** (default: `tome-http`). Legacy singular `store` + `cache` still parse and migrate into `dataStores`. The editor webview is a client of the HTTP service, not part of this package.

Multi-corpus sessions use multiple flatfile entries in `dataStores` (or legacy `store.options.corpora` / `TOME_CORPORA`) — see [`multi-corpus.md`](./multi-corpus.md). Mixed sessions must use a dedicated session `TOME_DB_PATH`, not any corpus’s own SQLite cache.

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

Preferred (`dataStores` + optional `sync`):

```json
{
  "version": 2,
  "dataStores": {
    "flatfile": {
      "module": "tome-flatfile",
      "export": "createFlatfileModule",
      "options": {}
    },
    "sqlite": {
      "module": "tome-sqlite",
      "export": "createSqliteModule",
      "options": {}
    }
  },
  "sync": { "queryStoreId": "sqlite" },
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

Legacy singular `store` + `cache` (still accepted; normalized at load):

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
  "services": []
}
```

- **`dataStores`** (or legacy **`store` + `cache`**) required. Flatfile entries may omit `contentPath` (host fills `TOME_CONTENT_PATH`); sqlite may omit `dbPath` (`TOME_DB_PATH`).
- Normalize **auto-injects** an FTS sink (`tome-search-sqlite`, id `fts`) when missing, and does **not** treat FTS modules as the query cache when picking `sync.queryStoreId`.
- `services` may be **empty**: the host logs a warning and stays up.
- Path defaults and `TOME_CORPORA` expand into flatfile `dataStores` during normalize — see [tome-sync.md](./tome-sync.md) and [multi-corpus.md](./multi-corpus.md). Explicit `dataStores` skip corpora env expansion; use legacy `store`+`cache` (or a multi-corpus `dataStores` map) when relying on `TOME_CORPORA`.

Bootstrap order: normalize config → `openDataStoreSession` (open stores, wire Imp sync observers) → open graph services **without** blocking sync or file watchers → **start service modules (HTTP binds)** → run `CacheSync.ensureReadyAsync()` → mark ready, `startWatching()` (observers already installed; do not double-subscribe).

While syncing, `/api/health` reports `ready: false` / `syncing: true` with optional numeric `progress`; other API routes return **503** `cache_syncing`. After sync completes, health reports `ready: true` and data routes work normally. See [tome-db.md](./tome-db.md) § Cache sync at startup.

Startup logs: `[tome-server]` path/config lines, `Tome API listening on …` (may appear **before** sync finishes), then `[tome-sync]` phase progress, then `[tome-server] graph ready (…ms)`.

## Run

```bash
bun run server:dev
# alias: bun run editor:api
```

Requires `TOME_CONTENT_PATH` (and usually a populated content tree). Historical env: `TOME_EDITOR_API_PORT` still overrides the HTTP port when config omits `options.port`.

## Request / SQL profiling (opt-in)

Default **off** (one boolean check per HTTP request and per SQLite statement execute; no timers when disabled).

Storage and debug vocabulary follow **OpenTelemetry span** concepts (`trace_id`, `span_id`, `parent_span_id`, SpanKind, attributes) without the OTel SDK or OTLP export.

| Knob | Purpose |
| --- | --- |
| `TOME_PROFILING=1` | Enable slow-span capture (HTTP + SQL + INTERNAL phases) |
| `TOME_PROFILING=verbose` | Record every timed span, not only slow ones |
| `TOME_PROFILING_SLOW_MS` | Threshold in ms (default **100**) |
| `TOME_PROFILING_DB_PATH` | Profiling SQLite path (default: sibling `tome-profiling.sqlite` next to the cache DB) |
| `TOME_PROFILING_LOG=1` | Mirror spans to stderr (default **off**) |
| `TOME_PROFILING_MAX_MB` | Soft retention ceiling in MB (default **32**; converted to a row cap via ~512 B/span) |
| `TOME_PROFILING_BATCH_DELETE_MB` | Oldest-span batch to delete when over the ceiling (default **4**) |
| `services[].options.profiling` | `true` or `"verbose"` in `tome-server.json` |
| `services[].options.slowMs` | Same threshold via config |

### Spans table (OTel-aligned)

Spans are appended to a dedicated SQLite file, table **`spans`**:

| Column | OTel analog |
| --- | --- |
| `trace_id` | 32-char hex (16 bytes) |
| `span_id` | 16-char hex (8 bytes) |
| `parent_span_id` | parent span, or null for roots |
| `name` | span name |
| `kind` | `SERVER` (HTTP), `CLIENT` (SQL), `INTERNAL` (JS phases) |
| `start_time` | ISO start (maps to OTel start time later if needed) |
| `duration_ms` | Imp-friendly duration (OTel uses start/end nanos) |
| `attributes` | JSON object of flat string/number/bool attrs |

Common attribute keys (semantic-convention inspired): `http.method`, `http.route`, `http.status_code`, `url.query`, `db.system`, `db.operation`, `db.statement`, `db.rows`, `db.params_count`.

All `GraphDatabase` statement executes (`.all` / `.get` / `.run`) emit CLIENT spans when profiling is on — not only `queryAll`. Nested work shares one `trace_id` via `AsyncLocalStorage`.

**INTERNAL phases (query pipelines):**

| Area | Span names | Branch signal (attributes) |
| --- | --- | --- |
| Relation tables | `getRelationTableSection`, `relation.loadConnections`, `relation.buildSection`, `listRelationshipsFromSourceWindow`, `relationWindow.count` / `.page` / `.mapRows` | (phase names; attrs mostly empty today) |
| Membership SQL compiler | `memberPage.analyze` / `.bind` / `.plan` / `.emit` | `member.mode`, `member.layers`, `member.order_kinds`, `member.has_member_ids`, `member.has_scope`, `member.has_groups`, `member.has_relation_fields`, `member.empty`, `member.apply_limit_offset` |
| Membership execute | `listMemberPage` / `listMemberPageNodeIds`, `memberPage.count` / `.page` | Same `member.*` keys on the parent (self-describing without joining compile children) |
| Dyn expression indexes | `exprIndex.ensureAll`, `exprIndex.ensure` | `exprIndex.path` (`skip` \| `patch` \| `rebuild`), `exprIndex.status`, `exprIndex.digest`, optional `exprIndex.in_flight` |

Items and composed table windows share the membership compiler/execute spans (one instrumentation site). Relation-edge SQL remains a separate path with its own INTERNAL names above.

When enabled:

- When the row ceiling is exceeded, the oldest **batch** of rows is deleted in one statement.
- Spans are **not** logged to stderr unless `TOME_PROFILING_LOG` is set.
- Legacy `samples` tables are dropped on open (disposable diagnostic DB).
- `GET /api/debug/profiling` returns `{ config, dbPath, schema: "spans" }`. **404** when profiling is off.
- `POST /api/debug/profiling/execute-imp` with `{ graph }` runs an Imp collection query via `imp-sql` against the **`spans`** table (filter / sort / limit / project — no pathing). **404** when off.

Containers: pass env at runtime (no image rebuild). Workbench Compose forwards the `TOME_PROFILING*` vars into the `tome` service — see [container.md](./container.md).

**Out of scope for now:** OTel npm packages, OTLP exporters, W3C `traceparent` propagation, span status/events/links/resource.
## See also

- [`web-api-design.md`](./web-api-design.md) — application-specific HTTP use-case rules
- [`tome-editor.md`](./tome-editor.md) — client UI
- [`tome-db.md`](./tome-db.md) — domain + sync; store/cache packages
- [`extensions.md`](./extensions.md) — page-block extensions (server runtime in `tome-server`)
- [`multi-corpus.md`](./multi-corpus.md) — multiple content roots in one session
- [`container.md`](./container.md) — env vars including profiling
- [`graph-store.md`](./graph-store.md) — composed SQLite read path (nodes + relationships)
