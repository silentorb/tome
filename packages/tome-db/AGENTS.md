# Tome-db — agent notes

## What it is
- Domain query/mutation layer + **content↔SQLite sync** (`CacheSync`, `TomeWriteContext`).
- Depends on `tome-store-flatfile` (canonical content) and `tome-cache-sqlite` (query cache).
- Convenience: `openContentGraph(contentDir, dbPath)` opens both and wires sync + store subscriptions.

## Terminology

- **Node** — entity in `content/data/{shard}/{id}.md` and cache `nodes`.
- **Relationship** — link in `content/data/relationships.json` with types in lower snake_case.
- **Page** — editor view of a node (`getNodePageDetail`).
- **Type table** — node with incoming set-membership and/or a [`table-schemas.json`](../../docs/features/table-schemas.md) entry.
- **Schema** — relationship rules in `content/model/schema.json`.

Cache tables (in `tome-cache-sqlite`): `nodes`, `relationship_records`, `relationship_projections`.

## Run
- Tests: `bun test` (from this directory).
- Writes: `openContentGraph` / `openTomeWriteContext(store, cache)`; context field is **`cache`** (not `db`).

## Editing data

- **Canonical store:** `content/` via `tome-store-flatfile` `ContentStore`.
- Rebuild cache: `bun run content:sync` from repo root.
- **Do not** edit `data/tome.sqlite` directly for routine updates.

## Repo-wide context
- **Feature spec:** [`docs/features/tome-db.md`](../../../docs/features/tome-db.md)
- Root [`AGENTS.md`](../../AGENTS.md)
