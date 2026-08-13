# tome-flatfile — agent notes

## What it is

- **Store module:** `createFlatfileModule()` → `TomeStoreModule` (`open` → `ContentStore` or `CompositeStore` when `corpora` is set)
- Flatfile canonical store: `content/data/{nodes,relationships}/`, `content/archive/{nodes,relationships}/`, and `content/model/`
- Implements `TomeDataStore` from `tome-service-interfaces`, including change notifications via `subscribe` / `startWatching`
- **Multi-corpus:** see [`docs/features/multi-corpus.md`](../../docs/features/multi-corpus.md) — composite fronts N content roots with a node→corpus routing map
- **On-disk format:** [docs/storage-format.md](./docs/storage-format.md) — normative content layout for interoperable storage and agent reference

## Dependency rules

- Depends on `tome-graph-interfaces` + `tome-service-interfaces` among Tome packages
- Must **not** import `tome-db`, `tome-http`, or `tome-server`
- Does **not** own the SQLite query cache — domain syncs cache from store change events

## Run

- Tests: `bun test` (from this directory)
- Loaded by `tome-server` when listed as the `store` module in `tome-server.json`
