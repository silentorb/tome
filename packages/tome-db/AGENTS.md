# Tome-db — agent notes

## What it is
- TypeScript + **Bun**: `content/data/` (nodes + relationships) and `content/model/` (workspace JSON) + SQLite cache for queries.
- Uses Bun's built-in `bun:sqlite` (no extra native deps).
- Content default: `content/` at repo root. Cache default: `data/tome.sqlite` (gitignored).

## Terminology

- **Node** — entity in `content/data/{id}.md` and cache `nodes`.
- **Relationship** — link in `content/data/relationships.json` (v2: `{ a, b, type }`) with types in lower snake_case.
- **Relationship type** — storage type (composite for bidirectional pairs, e.g. `inspirations_features`) or local perspective (e.g. `inspirations` in UI).
- **Page** — editor view of a node (`getNodePageDetail`, `node-page-sections.ts`).
- **Type table** — node with incoming `is_a` and/or `notion_schema` metadata (`isTypeTableNode`).
- **Schema** — relationship rules in `content/model/schema.json` ([`docs/features/schema.md`](../../../docs/features/schema.md)).

Cache tables: `nodes`, `relationship_records`, `relationship_projections` (`SCHEMA_VERSION` 7).

## Run
- Tests: `bun test` (from this directory).
- Content API: `tome-db/content`; writes: `openTomeWriteContext`.

## Editing data

- **Canonical store:** `content/` — commit markdown + JSON changes (`relationships.json`, `relationship-types.json`).
- Use `ContentStore` / `TomeWriteContext` for mutations.
- Rebuild cache: `bun run content:sync` from repo root.
- **Do not** edit `data/tome.sqlite` directly or run `notion:import` / `--clean` for routine updates.

## Repo-wide context
- **Feature spec:** [`docs/features/tome-db.md`](../../../docs/features/tome-db.md)
- **Schema rules:** [`docs/features/schema.md`](../../../docs/features/schema.md)
- Graph Explorer LOD export: [`docs/features/graph-explorer.md`](../../../docs/features/graph-explorer.md)
- Global conventions: repository root [`AGENTS.md`](../../AGENTS.md)
