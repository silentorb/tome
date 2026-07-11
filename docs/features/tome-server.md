# Tome server

## Summary

**tome-server** is the process **host** for the design graph: it loads a singular **data store** and **query cache** from JSON config, wires them through `tome-db` into `TomeGraphServices`, then starts **zero or more** **service modules** (default: `tome-http`). The editor webview is a client of the HTTP service, not part of this package.

## When to read this

- Running or configuring the API without the editor UI
- Adding a new service module (protocol adapter)
- Understanding how store/cache/HTTP plug in without being production dependencies of `tome-server`

## Package graph

| Package | Role |
| --- | --- |
| `tome-graph-interfaces` | Domain DTOs + `TomeGraphServices` |
| `tome-service-interfaces` | Store/cache/service module contracts |
| `tome-store-flatfile` | Flatfile `TomeDataStore` (owns change watching) |
| `tome-cache-sqlite` | SQLite `TomeQueryCache` |
| `tome-db` | Domain queries/mutations + content↔cache sync |
| `tome-http` | Implements `TomeServiceModule`; HTTP routes + client SDK |
| `tome-server` | Config loader, infrastructure + graph wiring, starts services |
| `tome-editor` | Browser UI only |

**Do not** import `tome-http`, `tome-store-flatfile`, or `tome-cache-sqlite` from `tome-server` production sources — load them via config `dynamic import`. Tests may use `devDependency` entries.

## Config

File: `packages/tome-server/config/tome-server.json` (override with `TOME_SERVER_CONFIG`).

```json
{
  "version": 1,
  "store": {
    "id": "flatfile",
    "module": "tome-store-flatfile",
    "export": "createFlatfileStoreModule",
    "options": {}
  },
  "cache": {
    "id": "sqlite",
    "module": "tome-cache-sqlite",
    "export": "createSqliteCacheModule",
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

- **`store` and `cache` are required** (singular each).
- `services` may be **empty**: the host logs a warning and stays up.
- Multiple services are allowed (each typically binds its own port in v1).
- Path defaults (`TOME_CONTENT_PATH`, `TOME_DB_PATH`) are merged into module options by the host when omitted.

Bootstrap order: open store → open cache (with enum codec + set perspectives from content) → open graph services (subscribe to store changes, `store.startWatching()`) → start service modules.

## Run

```bash
bun run server:dev
# alias: bun run editor:api
```

Requires `TOME_CONTENT_PATH` (and usually a populated content tree). Historical env: `TOME_EDITOR_API_PORT` still overrides the HTTP port when config omits `options.port`.

## See also

- [`tome-editor.md`](./tome-editor.md) — client UI
- [`tome-db.md`](./tome-db.md) — domain + sync; store/cache packages
- [`extensions.md`](./extensions.md) — page-block extensions (server runtime in `tome-server`)
