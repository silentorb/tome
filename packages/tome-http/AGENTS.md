# tome-http — agent notes

## What it is

- **Service module:** `createTomeHttpService()` → `TomeServiceModule` (binds its own listener in `start`)
- **Client SDK:** `createHttpClient` / `tome-http/client` for editor and scripts

## Dependency rules

- Depends on `tome-graph-interfaces` + `tome-service-interfaces` only among Tome packages
- Must **not** import `tome-db` or `tome-server`
- `tome-server` must **not** import this package in production sources (load via config)

## Run

Loaded by `tome-server` when listed in `tome-server.json` `services`.
