# Tome-db — agent notes

## What it is
- Domain query/mutation layer + **content↔SQLite sync** (`CacheSync`, `TomeWriteContext`).
- Depends on `tome-flatfile` (canonical content), `tome-sqlite` (query cache), and `tome-mir` (Imp sync fabric).
- Host sync session: `openDataStoreSession` from `tome-db/sync-session` (flatfile/sqlite adapters, git watch). Fabric wire/publish/registry: `tome-mir`.
- Convenience: `openContentGraph(contentDir, dbPath)` opens both and wires sync + store subscriptions.

## Terminology

- **Node** — entity in `content/data/nodes/{shard}/{id}.md` (or `content/archive/nodes/…`) and cache `nodes`.
- **Relationship** — link under `content/data/relationships/{shard}/{digest}.json` (archive under `content/archive/relationships/`).
- **Page** — editor view of a node (`getNodePageDetail`).
- **Type table** — node with incoming set-membership and/or a [`table-schemas.json`](../../docs/features/table-schemas.md) entry.
- **Schema** — relationship rules in `content/model/schema.json`.

Cache tables (in `tome-sqlite`): `nodes`, `relationship_records`, `relationship_projections`.

## Run
- Tests: `bun test` (from this directory).
- Writes: `openContentGraph` / `openTomeWriteContext(store, cache)`; context field is **`cache`** (not `db`).

## Editing data

- **Canonical store:** `content/` via `tome-flatfile` `ContentStore`.
- Rebuild cache: `bash scripts/content-sync.sh` from the tome repo (or corpus `bun run content:sync`). Always force-rebuilds — does not trust `content_mtime_ms`. Multi-corpus editor session: workbench `bash scripts/session-content-sync.sh` (stop the tome service if the DB is locked).
- **Do not** edit `data/tome.sqlite` directly for routine updates.

## Repo-wide context
- **Feature spec:** [`docs/features/tome-db.md`](../../../docs/features/tome-db.md)
- Root [`AGENTS.md`](../../AGENTS.md)
