# Notion import (legacy)

## Status

**Legacy / archival.** This pipeline was used to build the initial graph from Notion exports. **Ongoing work must not rely on full re-imports.** Edit `content/` directly ([tome-db.md](./tome-db.md)); use `./exports/` only to **mine** missing data into content files. To migrate an old SQLite file: `bun run content:export`.

## Summary

The Notion import feature transforms narrative and database content from a Notion export into a property graph (today: `content/data/` + `content/model/`; historically `data/marloth.sqlite`), plus machine-readable metadata under `docs/`. Implementation is archived in `packages/_archive/notion-importer`; graph storage in `packages/tome-db`.

## When to read this

Read this doc when your task involves:

- Maintaining or understanding the **legacy** import implementation
- **Mining** `./exports/` for data not yet in the graph (targeted upserts, not `notion:import --clean`)
- Import manifest or unresolved relation reports from a past import
- Notion → graph mapping conventions (for export mining scripts)

**Do not read this for routine graph edits** — use [tome-db.md](./tome-db.md) and root [`AGENTS.md`](../../AGENTS.md) (**Graph data workflow**).

For graph schema, storage, and query API, see [tome-db.md](./tome-db.md).

## Requirements

### Source resolution

- The pipeline **must** accept a directory or `.zip` export path via `--source` or `NOTION_EXPORT_DIR`.
- By default, the pipeline **must** prefer the most recently modified entry in `./exports/`.
- If `./exports/` is empty or missing (and no `--source` / `NOTION_EXPORT_DIR`), the pipeline **must** fail with a clear error.
- Zip sources **must** be extracted to a temporary directory for the run. Nested part archives (e.g. `ExportBlock-…-Part-1.zip`) **must** be unpacked recursively until only pages and CSVs remain.

### Output

- The pipeline **must** write the property graph to `data/marloth.sqlite` by default (`--db` / `MARLOTH_DB_PATH` to override).
- Stable row identity **must** be the **32-hex Notion id** as the node id for pages.
- Export archives under `./exports/` **must** keep Notion exporter names; node `source_export` records the repo-relative path.

### Page import

Each Notion page (`.md`) **must** become a graph node with properties including at minimum:

- `title` — from first `#` heading
- `notion_id` — 32-hex id from source filename
- `source_export` — repo-relative path to exported `.md`
- `source_export` — path to the export file (provenance only; not used for graph organization)
- `body` — markdown body (relation property lines removed; converted to relationships)
- `alias` — short title without trailing id suffix
- Scalar `Key: value` lines before the body **must** be stored as slugified, emoji-stripped property keys

**Historical:** early imports also wrote a `NotionPage` label on each page node via the `node_labels` table. That label layer was removed in SQLite schema v6; page nodes are identified by properties and graph usage, not import labels.

### Relations

- Notion relation properties (`Label (path.md)` lists) **must** become directed relationships to target page nodes.
- Relationship labels **must** be uppercase slug forms of the property name (emoji stripped).
- Ordered relation lists **should** store `ordinal` on the relationship.

### Database CSV import

For each `*.csv` matching Notion database export naming (`Name {database_id}.csv`, `Name {id}_all.csv`, etc.):

- Emit a type-table node keyed by `database_id` (with `notion_schema` / `notion_database` metadata when synced).
- Each row with a linked Name **must** create an `IS_A` relationship from the page to the type (database), carrying scalar column values as relationship properties (not on the page node).
- Rows without a resolvable page **must** create a stub page node and an `IS_A` relationship (deterministic orphan id); do not store row payloads on the database node.
- Relation columns **must** become relationships from the row's page to targets.

**Historical:** early imports also wrote a `NotionDatabase` label on database/type nodes via `node_labels`. Removed in schema v6; type tables are detected by incoming `IS_A` and/or schema metadata (`isTypeTableNode`).

### Manifest and reports

- The pipeline **must** write `docs/notion-import-manifest.json` with node index, database views, and counts.
- The pipeline **must** write `docs/notion-link-report.txt` for unresolved relation paths.
- The pipeline **must** be **idempotent**: the same export tree yields the same logical graph.

### Clean mode

- With `--clean`, the pipeline **must** replace the database file before import (full rebuild). **Deprecated for production workflow** — destroys in-graph edits (e.g. ordered-association `order`, manual fixes). Reserved for empty dev copies or historical reproduction.

## Mining exports without full import

When required data exists only under `./exports/`:

1. Locate the page `.md` or database `.csv` in the archive (see **Source resolution** and mapping tables in [tome-db.md](./tome-db.md)).
2. Parse with existing `packages/_archive/notion-importer` helpers (`parse`, `relations`, `indexes`, etc.) or equivalent logic in a one-off script.
3. **Upsert** only the affected nodes/relationships into `content/data/` via `ContentStore` / `openTomeWriteContext` — no full re-import.
4. Spot-check with `getNodeDetail` or the editor; commit changes under `content/`. Run `bun run content:sync` if the editor API is not running.

## Design rationale

### Graph instead of flat markdown

- **Goal:** support richer data modeling (relations, databases, future world-building entities) beyond what Notion or a flat markdown vault could express cleanly.
- **Rejected:** continuing flat `content/*.md` as the primary store — relation-heavy corpus was outgrowing file-based navigation.
- **Trade-off:** no longer optimized for Obsidian-style markdown vault browsing; markdown body remains on nodes for reading/export.

See [tome-db.md](./tome-db.md) for graph storage rationale.

### Emoji stripping on names only

- Property **names** (YAML keys, relationship labels) **must** have emojis stripped.
- Property **values** **must not** be altered unless they are clearly property labels.

## Behavior / pipeline

High-level stages (see `packages/_archive/notion-importer/src/graph-pipeline.ts`):

1. **Resolve source** — pick export dir/zip; extract zips recursively.
2. **Open database** — create schema; optional clean rebuild.
3. **Import pages** — parse each `.md`; upsert page nodes.
4. **Import relations** — parse relation properties; upsert relationships (stub targets if needed).
5. **Import CSVs** — upsert type-table nodes; row membership and relation relationships.
6. **Write artifacts** — manifest JSON, link report; vacuum database.

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `./exports/` | Notion export drop zone (most recent `.zip` or directory wins) |
| `data/marloth.sqlite` | Property graph output |
| `docs/notion-import-manifest.json` | Import summary |
| `docs/notion-link-report.txt` | Unresolved relation paths |

## Quick start

**Preferred:** edit `content/` directly — see [tome-db.md](./tome-db.md).

Legacy full import (deprecated; avoid for routine work; overwrites the graph):

```bash
# Uses newest entry in ./exports/ — destructive with --clean
bun run notion:import -- --clean
bun run notion:import -- --source ./exports/my-export.zip --clean
```

Alternative entry points: `./scripts/notion-importer` or `bun run --cwd packages/_archive/notion-importer start` (archival reference only).

## Configuration

Every option is available via **CLI** and **environment**; precedence is **CLI > env > defaults**.

| Setting | CLI | Environment |
| --- | --- | --- |
| Export source | `--source <path>` | `NOTION_EXPORT_DIR` |
| Database path | `--db <path>` | `MARLOTH_DB_PATH` |
| Full replace | `--clean` | — |
| Repo root | `--repo <path>` | — |

See `bun run notion:import -- --help` for full flag list.

## Verification

- **Unit tests:** `bun test` from `packages/_archive/notion-importer/` (archival).
- **Manifest:** after import, `docs/notion-import-manifest.json` lists expected node count.
- **Link report:** inspect `docs/notion-link-report.txt` for broken relation targets.
- **Idempotency:** re-run on the same export; logical graph should not change except for intentional parser updates.

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | CLI entry |
| `src/config.ts` | CLI/env resolution |
| `src/graph-pipeline.ts` | Graph import orchestration |
| `src/relations.ts` | Notion relation link parsing |
| `src/parse.ts` | Page splitting |
| `src/indexes.ts` | CSV parsing |
| `src/ids.ts`, `src/textutil.ts` | Id extraction, slugging, emoji strip |

When implementation and this doc disagree, treat **this doc as authoritative** until one is updated explicitly.

## See also

- [tome-db.md](./tome-db.md) — property graph schema and API
- [`packages/_archive/notion-importer/AGENTS.md`](../../packages/_archive/notion-importer/AGENTS.md)
- [`AGENTS.md`](../../AGENTS.md)
