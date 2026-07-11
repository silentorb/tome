# Tome server

## Summary

**tome-server** is the process **host** for the design graph: it wires `tome-db` into `TomeGraphServices` and loads **zero or more** **service modules** from JSON config (default: `tome-http`). The editor webview is a client of the HTTP service, not part of this package.

## When to read this

- Running or configuring the API without the editor UI
- Adding a new service module (protocol adapter)
- Understanding how `tome-http` plugs in without being a production dependency of `tome-server`

## Package graph

| Package | Role |
| --- | --- |
| `tome-graph-interfaces` | Domain DTOs + `TomeGraphServices` |
| `tome-service-interfaces` | `TomeServiceModule` / `TomeServiceHost` |
| `tome-http` | Implements `TomeServiceModule`; HTTP routes + client SDK |
| `tome-server` | Config loader, graph wiring, starts services |
| `tome-editor` | Browser UI only |

**Do not** import `tome-http` from `tome-server` production sources — load it via config `dynamic import`. Tests may use a `devDependency`.

## Config

File: `packages/tome-server/config/tome-server.json` (override with `TOME_SERVER_CONFIG`).

```json
{
  "version": 1,
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

- `services` may be **empty**: the host logs a warning and stays up.
- Multiple services are allowed (each typically binds its own port in v1).

## Run

```bash
bun run server:dev
# alias: bun run editor:api
```

Requires `TOME_CONTENT_PATH` (and usually a populated content tree). Historical env: `TOME_EDITOR_API_PORT` still overrides the HTTP port when config omits `options.port`.

## Future (not in this change)

Singular pluggable **data store** and **query cache** behind the host; service modules remain zero-or-more.

## See also

- [`tome-editor.md`](./tome-editor.md) — client UI
- [`tome-db.md`](./tome-db.md) — content + SQLite cache
- [`extensions.md`](./extensions.md) — page-block extensions (server runtime in `tome-server`)
