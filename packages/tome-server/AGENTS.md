# tome-server — agent notes

## What it is

Composition root / host:

1. Open content + SQLite via `tome-db`
2. Expose `TomeGraphServices`
3. Load service modules from JSON config (`dynamic import`) — **no production dependency on `tome-http`**

## Config

`TOME_SERVER_CONFIG` or default `config/tome-server.json` in this package. `services` may be empty (warn + stay up).

## Dependency rules

- Production: `tome-graph-interfaces`, `tome-service-interfaces`, `tome-db`, `tome-interfaces`
- **Do not** import `tome-http` from `src/` (devDependency for tests only)

## Run

```bash
bun run --filter tome-server dev
# or from repo root: bun run server:dev
```
