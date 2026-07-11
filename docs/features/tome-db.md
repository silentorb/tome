# Tome database

## Summary

The Marloth design corpus is a **git-tracked content store** under `content/` (`content/data/` for nodes and relationship instances; `content/model/` for workspace JSON). Implementation lives in `packages/tome-db`. **`content/` is the canonical root**; `data/tome.sqlite` is the **local, gitignored query cache** rebuilt from content (legacy `data/marloth.sqlite` is still read when present). Use `bun run content:export` to migrate an old SQLite file into `content/`.

## When to read this

Read this doc when your task involves:

- `data/tome.sqlite` (or legacy `data/marloth.sqlite`) or the `./data/` directory
- `packages/tome-db/` schema, graph API, or queries
- Modeling nodes, relationships, types, or properties
- Editing or migrating graph data in place (not via full re-import)
- Extending the graph schema or API

For **what design nodes mean** (features, inspirations, products, traceability), read [`../ontology.md`](../ontology.md) alongside this doc.

## Terminology (post-migration)

| Term | Meaning |
| --- | --- |
| **Node** | Entity in `nodes` (replaces *vertex* / *record* in API and docs). |
| **Relationship** | Link between two nodes with a **relationship type** and JSON properties. |
| **Relationship type** | Lower snake_case name (e.g. `is_a`, `inspirations_features`, `part`). Bidirectional relationship pairs use a single composite type. |
| **Perspective type** | Local type name used in UI/API from one endpoint (e.g. `inspirations` on a Feature page). Mapped to composite storage types via `relationship-types.json`. |
| **Page** | Editor-facing node view (`getNodePageDetail`, `NodePageView`)—not a filesystem export file. |
| **Type table** | Node listed in [`table-schemas.json`](./table-schemas.md) and/or receiving `is_a` rows. |
| **Schema** | Workspace model config in `content/model/schema.json` (relationship rules, enums) — see [schema.md](./schema.md). |

API names: `ContentStore`, `openTomeWriteContext`, `getNodeDetail`, `getNodePageDetail`, `GET /api/nodes`, `?node=`. Cache tables: `nodes`, `relationship_records`, `relationship_projections` (`SCHEMA_VERSION` **11**).

## Editing the graph (agent workflow)

**Default:** change files under `content/`.

- Use `ContentStore` / `TomeWriteContext` (via editor API or `openTomeWriteContext`), or edit `content/data/{shard}/{id}.md`, `content/data/relationships.json`, and `content/model/relationship-types.json` directly.
- Commit changes under `content/`; do not commit `data/tome.sqlite` or legacy `data/marloth.sqlite`.
- Run `bun run content:sync` after bulk file edits if the editor API is not running (otherwise the file watcher syncs automatically).

**Schema changes:** bump `SCHEMA_VERSION` in `schema.ts`, migrate existing rows in place, document steps here or in commit notes.

## Requirements

### Storage

| Path | Role |
| --- | --- |
| `content/data/{shard}/{nodeId}.md` | Canonical node (YAML frontmatter + markdown body); `{shard}` is the first two ULID entropy characters (`id.slice(10, 12)`) |
| `content/data/relationships.json` | Canonical bidirectional relationship records as ordered `(a, b)` tuples (v3) |
| `content/model/relationship-types.json` | Composite type → ordered `perspectives` pair (`perspectives[0]` describes the node at tuple index 0, `perspectives[1]` the node at index 1); optional `perspectiveLabels` per perspective for relation-section titles and link-add copy |
| `content/model/views.json` | UI table tab definitions (custom + generated providers) |
| `content/model/dynamic-fields.json` | Dynamic table field bindings |
| `content/model/schema.json` | Relationship rules and property enums |
| `content/model/table-schemas.json` | Type-table column definitions |
| `content/model/workspace.json` | Home, archive, protected nodes, quick links, branding, legacy path prefixes |
| `content/model/ordered-associations.json` | Ordered-association configs (e.g. `scenes-by-book`) |
| `data/marloth.sqlite` | Local query cache (gitignored; default path via `MARLOTH_DB_PATH`) |

- `content/data/` holds node markdown under entropy shard directories (`{id.slice(10,12)}/`) plus `relationships.json` at the data root.
- `content/model/` holds workspace model JSON (flat within `model/`).
- `MARLOTH_CONTENT_PATH` **must** point at the **content root** (`./content`), not `content/data`.
- Node basenames **must** match `^[0-9A-HJKMNP-TV-Z]{26}\.md$` (uppercase ULID); path is `content/data/{id.slice(10,12)}/{id}.md`.
- SQLite WAL sidecar files (`*.sqlite-wal`, `*.sqlite-shm`) **must not** be committed.

### Legacy compatibility

Non-breaking read support for Marloth-era names. Do not remove without a migration note.

| Surface | Policy | Location |
| --- | --- | --- |
| `marloth:` / `marloth://node/` URLs | Supported indefinitely | [`packages/tome-db/src/markdown-links.ts`](../../packages/tome-db/src/markdown-links.ts) |
| `MARLOTH_*` environment variables | Deprecated aliases for `TOME_*` | [`packages/tome-db/src/content/paths.ts`](../../packages/tome-db/src/content/paths.ts); editor [`packages/tome-editor/src/api/paths.ts`](../../packages/tome-editor/src/api/paths.ts); static-site config |
| `data/marloth.sqlite` | Legacy cache path; used when `data/tome.sqlite` is absent | [`packages/tome-db/src/content/paths.ts`](../../packages/tome-db/src/content/paths.ts) |
| `.marloth/user-settings.json` | Legacy settings directory | [`packages/tome-editor/src/api/paths.ts`](../../packages/tome-editor/src/api/paths.ts) |
| `marloth.graph.*` browser `localStorage` | Dual-read for Graph Explorer prefs; writes use `tome.graph.*` | [`packages/tome-editor/src/webview/graph-preferences.ts`](../../packages/tome-editor/src/webview/graph-preferences.ts) |

Prefer `TOME_*` env vars and `data/tome.sqlite` for new setups. See also [tome-editor.md](./tome-editor.md) for editor-specific env fallbacks.

### Property graph model

**Content (canonical, compact):** one record per logical link:

```json
{ "a": "<ulid>", "b": "<ulid>", "type": "member_of", "properties": { } }
```

- Endpoints `a` / `b` are an **ordered tuple**. Positions 0 (`a`) and 1 (`b`) carry **no inherent source/target meaning** — each position's meaning is defined entirely by the relationship type's ordered `perspectives` pair in `relationship-types.json` (`perspectives[0]` describes the node at `a`, `perspectives[1]` the node at `b`). Authored order is preserved verbatim: there is **no lexicographic endpoint sorting** and no `directedFrom` field.
- **Relative semantics come from tuple position + the type's per-position perspective** — never from slug comparison, endpoint sorting, or a stored direction flag.
- **Set membership** (`member_of`) is authored as `(member, set)` (member at index 0, set at index 1) and expands to dual projections (`member_of`, `members`). See [set-membership.md](./set-membership.md).
- **Symmetric** types (e.g. `includes`, `neighbor`, `enemies_enemies`) carry no directional meaning, so tuple order is irrelevant for them; UI resolves association context via the relation column's target database.
- **Associative** links use `includes` (migrated from legacy composites such as `inspirations_features`, `scenes_characters`).
- **Structural** and **taxonomy↔inspiration** pairs use named composite types (e.g. `scenes_part`, `monsters_inspirations`) whose two perspectives fix the meaning of each tuple position.
- **Single-perspective (unidirectional) types are forbidden.** Every entry in `relationship-types.json` defines a `perspectives` **tuple of exactly two** slugs (typed `PerspectivePair`); there is no `bidirectional` field, and the parser rejects any type that does not have exactly two perspectives. All relationships are bidirectional by construction. The write path (`resolveCompositeTypeForLink`) throws `LinkResolutionError` if a local type cannot resolve to `includes`, a dual-perspective composite, or `member_of`. See `packages/tome-db/scripts/audit-relationship-resolution.ts` to verify a content directory has no unresolvable entries.
- Record id: `{a}:{b}:{type}` (keyed on authored tuple order, so it is order-sensitive).

**SQLite cache (denormalized):** expanded on sync for fast directed queries:

| Table | Role |
| --- | --- |
| `relationship_records` | Mirror of content records |
| `relationship_projections` | Directed rows `(source, target, local_type)` — hot path for queries |
| `nodes` | Entity property bags; `is_archived` denormalized flag (recomputed on sync) |
| `meta` | Schema version, content mtime, enum config fingerprint |

**Archive membership:** a page is archived when it has set membership (`is_a`) on the Archive hub node (`01KWN86X6MFZQAJ1V36T95928S`). Archiving (`POST /api/nodes/:id/archive`) marks every other incident relationship in `relationships.json` with top-level `"archived": true`, then adds the hub membership edge (without `archived`). Unarchiving (`POST /api/nodes/:id/unarchive`) removes the hub membership edge and clears `archived` on incident relationships whose other endpoint is not still archived.

**Archived relationships in content:** entries with `"archived": true` are kept in git-tracked `relationships.json` but **skipped** when syncing to SQLite. The hub membership `includes` edge is always synced so `nodes.is_archived` can be recomputed. Search and `nodes.is_archived` exclude archived pages; graph export also excludes archived nodes.

One-time backfill for existing archive members: `bun scripts/migrate-archive-relationship-flags.ts`.

**Enum properties in cache:** keys declared in [`content/model/schema.json`](../../content/model/schema.json) `enums` (e.g. `priority`) are stored in SQLite relationship `properties` JSON as **0-based indices** into the enum’s `options` array. Git-tracked [`content/data/relationships.json`](../../content/data/relationships.json) keeps **string labels**. Encode on cache write and decode on cache read (`packages/tome-db/src/enum-codec.ts`, `graph.ts`). Changing enum `options` order in `schema.json` triggers a relationship cache re-sync (file watcher + `enum_config_fingerprint` meta check). After pulling enum-cache changes or a `SCHEMA_VERSION` bump, run `bun run content:sync` (or restart the editor API) to rebuild the cache from content.

Type-table behavior is inferred from `is_a` usage and schema metadata (`isTypeTableNode` in `node-capabilities.ts`).

- Node ids **must** be canonical uppercase 26-char ULIDs (`[0-9A-HJKMNP-TV-Z]{26}`), minted by `generateNodeId()` in `node-create.ts`. They are compared as exact strings — no case/dash normalization.
- Projection ids **must** be deterministic: `{source_id}:{type}:{target_id}` (local perspective type).
- Relationship types **must** be lower snake_case (e.g. `scenes` → `scenes`, not `SCENES`).

### Markdown body links

Node cross-references in markdown `body` use two storage forms (see `packages/tome-db/src/markdown-links.ts` and `dynamic-node-links.ts`):

| Form | Example | Title source |
| --- | --- | --- |
| Static | `[Custom label](./{nodeId}.md)` | Stored anchor text |
| Dynamic | `[[{nodeId}]]` | Target node `properties.title` at render time |

Helpers: `expandDynamicNodeLinks`, `collapseDynamicEditorLinks`, `findMarkdownLinksToTarget` (includes dynamic syntax for backlinks). One-time migration converts static links whose anchor text matches the target node's `properties.title` or `properties.alias` (accent/case-insensitive; markdown emphasis stripped from anchor text). Custom anchor text is left static. Run: `bun scripts/migrate-static-links-to-dynamic.ts [--dry-run]`.

### Type tables and rows

| Concept | Graph representation |
| --- | --- |
| Type table | Node id in `table-schemas.json` (column defs) + optional `is_a` incoming edges |
| Row / type instance | Relationship `(member)-[:is_a {view, row_index, …}]->(set)` with scalar props on the edge; `(set)-[:members]->(member)` is the inverse projection |
| Relation column | Outgoing relationships from the row page; scoped by row `is_a` membership |
| Stored scalars | Keys from `table-schemas.json` columns, values on `is_a` edge properties |

Database table **relation columns** are scoped by the row node's **`is_a` membership** in the viewing database—not by per-edge `via_database` properties (removed; see `scripts/migrate-remove-via-database.ts`).

Consolidate legacy dual directed edges with `bun scripts/consolidate-relationships.ts` (already run on the corpus). Migrate associative composites to `includes` with `bun scripts/migrate-to-includes.ts` (already run on the corpus).

### Schema versioning

- `meta.schema_version` **must** record the graph DDL version (`packages/tome-db/src/schema.ts`).
- Breaking schema changes **must** bump `SCHEMA_VERSION` and document migration steps.

## Behavior / API

`GraphDatabase` (`packages/tome-db/src/graph.ts`):

- `upsertNode(id, properties)` — create or merge node
- `listRelationshipsFromSource` / `listRelationshipsToTarget` — query projection table by local perspective type
- `getNodeDetail` / `getNodePageDetail` — inspection; the latter adds **metadata** and ordered **sections** (markdown, database table, relation tables)
- `getDatabaseViewDetail` — database row table for a type-table node
- `finalize()` — `PRAGMA optimize` + `VACUUM`
- Constructor `{ clean: true }` — delete existing file before open

Writes go to `content/` via `ContentStore`; sync expands to SQLite projections.

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `content/` | Canonical property graph root (`data/` + `model/`) |
| `data/marloth.sqlite` | Local query cache |
| `scripts/consolidate-relationships.ts` | One-time / re-run migration v1 → v2 relationships |
| `packages/tome-db/scripts/migrate-relationship-order.ts` | Reorder relationship tuples into meaningful order + drop `directedFrom` + bump v2 → v3, then rebuild cache and validate |
| `scripts/migrate-to-includes.ts` | Migrate associative relationship types to `includes` |
| `scripts/migrate-remove-via-database.ts` | Strip legacy `via_database` edge properties (scoping uses row `is_a`) |
| `scripts/migrate-archive-to-includes.ts` | Migrate archive membership from hub links / legacy paths to `includes` on the Archive hub |
| `scripts/migrate-archive-relationship-flags.ts` | Flag incident relationships `archived: true` for existing archive members |

## Quick start

```bash
# Inspect or edit the graph (Bun, from repo root)
bun -e "
import { GraphDatabase } from 'tome-db';
const db = new GraphDatabase('data/marloth.sqlite');
console.log(db.counts());
db.close();
"
```

## Configuration

| Setting | CLI | Environment | Default |
| --- | --- | --- | --- |
| Content directory | — | `MARLOTH_CONTENT_PATH` | `{repo}/content` |
| Cache database path | — | `MARLOTH_DB_PATH` | `data/marloth.sqlite` |

## Verification

- **Unit tests:** `bun test` in `packages/tome-db/`.
- **After content edits:** `bun run content:sync` or use the editor API; spot-check via `getNodeDetail` or the editor.

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `packages/tome-db/src/schema.ts` | DDL and version |
| `packages/tome-db/src/graph.ts` | GraphDatabase API (reads projections) |
| `packages/tome-db/src/content/relationships-file.ts` | v3 `relationships.json` parse/serialize (ordered `(a, b)` tuples) |
| `packages/tome-db/src/migrations/relationship-order.ts` | Reorder tuples into meaningful `(index0, index1)` order (member→set, typed asymmetric via node types); drop legacy `directedFrom`; bump v2→v3 |
| `packages/tome-db/src/content/relationship-types-file.ts` | `relationship-types.json` parse/serialize + composite helpers |
| `packages/tome-db/src/relationship-types/load.ts` | Cached `relationship-types.json` loader |
| `packages/tome-db/src/relationship-type-label.ts` | `perspectiveDisplayLabel`, `perspectiveLinkAddLabel` |
| `packages/tome-db/src/content/relationship-sync-expand.ts` | Content → SQLite projection expansion |
| `packages/tome-db/src/content/sync.ts` | Cache rebuild; `content/data` + `content/model` file watchers |
| `packages/tome-db/src/graph-export.ts` | Full graph and Graph Explorer LOD export |
| `packages/tome-db/src/node-page-sections.ts` | Universal page sections |
| `packages/tome-db/src/database-view-relations.ts` | Relation-column hydration |
| `packages/tome-db/src/ordered-associations.ts` | Ordered association config, view query, move mutation |
| `packages/tome-db/src/table-schemas/load.ts` | `table-schemas.json` loader |

## See also

- [set-membership.md](./set-membership.md) — set membership family (`is_a` / `members`), archive as set
- [schema.md](./schema.md) — workspace model config in `content/model/schema.json`
- [graph-explorer.md](./graph-explorer.md) — anchor-scoped LOD graph visualization
- [ordered-associations.md](./ordered-associations.md) — automatic sequence for associations (scenes-first)
- [`../ontology.md`](../ontology.md) — design domain model (storage-agnostic)
- [`packages/tome-db/AGENTS.md`](../../packages/tome-db/AGENTS.md)
- [`AGENTS.md`](../../AGENTS.md) — project purpose, terminology, modeling direction

## Future expansion

- **Multi-dimensional slicing** — product is one axis today; expect additional dimensions (arc, medium, audience, etc.) as types, properties, or relationships.
- **Weighted relationships** — e.g. feature↔inspiration strength as a numeric relationship property rather than a boolean link.
