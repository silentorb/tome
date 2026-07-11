# tome-service-interfaces — agent notes

## What it is

Plugin contracts for capabilities the **tome-server host** loads from config.

| Symbol | Meaning |
| --- | --- |
| `TomeServiceModule` | Pluggable hosted service (`start` / `stop`), zero-or-more in `services[]` |
| `TomeServiceHost` | Host context: `services` (`TomeGraphServices`) + per-entry `options` |
| `TomeStoreModule` / `TomeCacheModule` | Singular infrastructure modules (`open(options)`) |
| `TomeDataStore` / `TomeQueryCache` | Runtime store and query-cache contracts |
| `StoreChangeEvent` | Store-owned change notifications (domain syncs the cache) |

## Do not confuse

- **`TomeGraphServices`** (in `tome-graph-interfaces`) — domain operations facade
- **`TomeServiceModule`** — a hosted protocol adapter (e.g. HTTP), not the graph facade
- **`TomeDataStore` / `TomeQueryCache`** — infrastructure behind the host (singular each)

## Dependency rules

- May depend on `tome-graph-interfaces` for DTOs / `TomeGraphServices`
- Must **not** encode HTTP paths, verbs, or fetch clients
- Must **not** depend on `tome-db`, `tome-http`, `tome-server`, `tome-editor`, `tome-flatfile`, or `tome-sqlite`
