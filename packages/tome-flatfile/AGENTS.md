# tome-flatfile — agent notes

## What it is

- **Store module:** `createFlatfileModule()` → `TomeStoreModule` (`open` → `ContentStore`)
- Flatfile canonical store: `content/data/` (nodes + relationships) and `content/model/` (workspace JSON)
- Implements `TomeDataStore` from `tome-service-interfaces`, including change notifications via `subscribe` / `startWatching`

## Dependency rules

- Depends on `tome-graph-interfaces` + `tome-service-interfaces` among Tome packages
- Must **not** import `tome-db`, `tome-http`, or `tome-server`
- Does **not** own the SQLite query cache — domain syncs cache from store change events

## Run

- Tests: `bun test` (from this directory)
- Loaded by `tome-server` when listed as the `store` module in `tome-server.json`
