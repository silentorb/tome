# Meilisearch searcher + Imp sync sink

Status: open

## Intent

Add a `tome-meilisearch` package that mirrors `tome-search-sqlite`: a `SyncEndpoint` dataStore sink indexed via Imp `sync.graph`, plus a `searcher` extension that answers `GET /api/nodes/search`. Prefer Meilisearch over FTS5 when richer ranking and a dedicated search process are wanted.

## Notes

- Dual surface: `createMeiliSearchModule` (`SyncEndpoint` sink) + `./search` (`SearcherHost.registerSearcher`).
- Index via Imp sync (not ad-hoc store watchers); workbench graph would wire marloth→meili and marloth→session-cache.
- Always-on Compose `meilisearch` service + `runServices` + `MEILI_*` on the `tome` service.
- CI `test` job with a Meilisearch service container; full `bun run test` must match local (do not ship a weaker offline-only gate for Meili coverage).
- Release image stays offline tome-only; Meili remains a sidecar at deploy time.
- When ready, swap workbench default from FTS to Meili via `extensions.json` + `dataStores` / `sync.graph`.

See also: [tome-sync.md](../docs/features/tome-sync.md), searcher extensions, `tome-search-sqlite`.
