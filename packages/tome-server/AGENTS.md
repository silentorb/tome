# tome-server — agent notes

## What it is

Composition root / host:

1. Load singular **store** + **cache** modules from JSON config (`dynamic import`)
2. Open store, build enum codec / set-membership perspectives via `tome-db`, open cache
3. Expose `TomeGraphServices` (`openTomeGraphServices({ store, cache })`)
4. Start service modules from the same config — **no production dependency on `tome-http` / store / cache packages**

## Config

`TOME_SERVER_CONFIG` or default `config/tome-server.json` in this package.

Required slots: `store`, `cache` (singular module entries). `services` may be empty (warn + stay up).

## Dependency rules

- Production: `tome-graph-interfaces`, `tome-service-interfaces`, `tome-db`, `tome-interfaces`
- DevDependencies (config-loaded / tests): `tome-http`, `tome-flatfile`, `tome-sqlite`
- **Do not** statically import plugin packages from `src/` (resolve them via config `dynamic import`)

## Run

```bash
bun run --filter tome-server dev
# or from repo root: bun run server:dev
```
