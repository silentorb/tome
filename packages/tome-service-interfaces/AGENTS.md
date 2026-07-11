# tome-service-interfaces — agent notes

## What it is

Plugin contracts for capabilities the **tome-server host** starts from config.

| Symbol | Meaning |
| --- | --- |
| `TomeServiceModule` | Pluggable hosted module (`start` / `stop`) |
| `TomeServiceHost` | Host context: `services` (`TomeGraphServices`) + per-entry `options` |

## Do not confuse

- **`TomeGraphServices`** (in `tome-graph-interfaces`) — domain operations facade
- **`TomeServiceModule`** — a hosted plugin (e.g. HTTP), not the graph facade

## Dependency rules

- May depend on `tome-graph-interfaces` for `TomeGraphServices`
- Must **not** encode HTTP paths, verbs, or fetch clients
- Must **not** depend on `tome-db`, `tome-http`, `tome-server`, or `tome-editor`
