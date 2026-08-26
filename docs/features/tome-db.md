# Tome database

## Summary

The design corpus is a **git-tracked content store** under `content/` (`content/data/` for nodes and relationship instances; `content/model/` for workspace JSON). **`content/` is the canonical root**; `data/tome.sqlite` is the **local, gitignored query cache** rebuilt from content (legacy `data/marloth.sqlite` is still read when present).

| Package | Role |
| --- | --- |
| `tome-flatfile` | Flatfile `ContentStore` / `TomeDataStore` (codecs, model loaders, change watching) |
| `tome-sqlite` | SQLite `GraphDatabase` / `TomeQueryCache` |
| `tome-db` | Domain queries/mutations + `CacheSync` / `TomeWriteContext` bridge |

`tome-server` loads store + cache as singular config modules and injects them into `tome-db`. The flatfile store may be a **composite** over multiple corpora (union read, origin / dual-write); see [`multi-corpus.md`](./multi-corpus.md). Solo mode is still one `content/` root + one `data/tome.sqlite`.

## When to read this

Read this doc when your task involves:

- `data/tome.sqlite` (or legacy `data/marloth.sqlite`) or the `./data/` directory
- `packages/tome-flatfile/`, `packages/tome-sqlite/`, or `packages/tome-db/`
- Modeling nodes, relationships, types, or properties
- Editing or migrating graph data in place (not via full re-import)
- Extending the graph schema or API

For **what design nodes mean** (features, inspirations, products, traceability), read [`../ontology.md`](../ontology.md) alongside this doc.

## Terminology (post-migration)

| Term | Meaning |
| --- | --- |
| **Node** | Entity in `nodes` (replaces *vertex* / *record* in API and docs). |
| **Relationship** | Link between two nodes with a **relationship type** (association id) and JSON properties. |
| **Association id** / **Relationship type** | Opaque uppercase ULID key in `associations.json` and on each relationship record's `type` field. Identity is not derived from perspective names. |
| **Perspective** | User-facing label config for one endpoint of an association (`perspectives[0|1]`). Not a machine id. |
| **Projection type** | Directed cache/query identity `{associationId}:{0\|1}` on `relationship_projections.type`. |
| **Page** | Editor-facing node view (`getNodePageDetail`, `NodePageView`)—not a filesystem export file. |
| **Type table** | Node listed in [`table-schemas.json`](./table-schemas.md) and/or receiving set-membership rows. |
| **Schema** | Workspace model config in `content/model/schema.json` (relationship rules, enums) — see [schema.md](./schema.md). |

API names: `ContentStore`, `openContentGraph`, `TomeWriteContext` (`{ store, sync, cache }`), `getNodeDetail`, `getNodePageDetail`, `GET /api/nodes`, `?node=`. Cache tables: `nodes`, `relationship_records`, `relationship_projections` (`SCHEMA_VERSION` **11**).

## Editing the graph (agent workflow)

**Default:** change files under `content/`.

- Use `ContentStore` / `TomeWriteContext` (via editor API or `openContentGraph`), or edit `content/data/nodes/**/*.md`, `content/data/relationships/**/*.json`, and `content/model/associations.json` directly.
- Commit changes under `content/`; do not commit `data/tome.sqlite` or legacy `data/marloth.sqlite`.
- Run `bun run content:sync` after bulk file edits if the editor API is not running (otherwise the store watcher emits changes and `CacheSync` updates SQLite).

**Schema changes:** bump `SCHEMA_VERSION` in `tome-sqlite` `schema.ts`, migrate existing rows in place, document steps here or in commit notes.

## Requirements

### Storage

Canonical on-disk layout and file formats: [`packages/tome-flatfile/docs/storage-format.md`](../../packages/tome-flatfile/docs/storage-format.md).

| Path | Role |
| --- | --- |
| `content/data/nodes/{shard}/{nodeId}.md` | Live node (YAML frontmatter + markdown body); `{shard}` is the first two ULID entropy characters (`id.slice(10, 12)`) |
| `content/archive/nodes/{shard}/{nodeId}.md` | Archived node markdown (same shape) |
| `content/data/relationships/{shard}/{digest}.json` | Live relationship records (one edge per file; path from SHA-256 of composite key) |
| `content/archive/relationships/{shard}/{digest}.json` | Archived relationship records (tree location is archive status) |
| `content/model/*.json` | Workspace model (relationship types, schema, views, table schemas, workspace, etc.) — see storage-format doc |
| `data/tome.sqlite` | Local query cache (gitignored; default path via `TOME_DB_PATH`; legacy `data/marloth.sqlite` / `MARLOTH_DB_PATH` still read when present) |

- `TOME_CONTENT_PATH` (or legacy `MARLOTH_CONTENT_PATH`) **must** point at the **content root** (`./content`), not `content/data`, for solo sessions. Multi-corpus sessions use `TOME_CORPORA` / `store.options.corpora` and a dedicated session `TOME_DB_PATH` — see [`multi-corpus.md`](./multi-corpus.md).
- SQLite WAL sidecar files (`*.sqlite-wal`, `*.sqlite-shm`) **must not** be committed.

### Legacy compatibility

Non-breaking read support for Marloth-era names. Do not remove without a migration note.

| Surface | Policy | Location |
| --- | --- | --- |
| `marloth:` / `marloth://node/` URLs | Supported indefinitely | [`packages/tome-flatfile/src/markdown-links.ts`](../../packages/tome-flatfile/src/markdown-links.ts) |
| `MARLOTH_*` environment variables | Deprecated aliases for `TOME_*` | [`packages/tome-flatfile/src/content/paths.ts`](../../packages/tome-flatfile/src/content/paths.ts); server [`packages/tome-server/src/paths.ts`](../../packages/tome-server/src/paths.ts); static-site config |
| `data/marloth.sqlite` | Legacy cache path; used when `data/tome.sqlite` is absent | [`packages/tome-flatfile/src/content/paths.ts`](../../packages/tome-flatfile/src/content/paths.ts) |
| `.marloth/user-settings.json` | Legacy settings directory | [`packages/tome-server/src/paths.ts`](../../packages/tome-server/src/paths.ts) |
| `marloth.graph.*` browser `localStorage` | Dual-read for Graph Explorer prefs; writes use `tome.graph.*` | [`packages/tome-editor/src/webview/graph-preferences.ts`](../../packages/tome-editor/src/webview/graph-preferences.ts) |

Prefer `TOME_*` env vars and `data/tome.sqlite` for new setups. See also [tome-editor.md](./tome-editor.md) for editor-specific env fallbacks.

### Property graph model

**Content (canonical, compact):** one record per logical link:

```json
{ "a": "<ulid>", "b": "<ulid>", "type": "<association-ulid>", "properties": { } }
```

- Endpoints `a` / `b` are an **ordered tuple**. Positions 0 (`a`) and 1 (`b`) carry **no inherent source/target meaning** — each position's meaning is defined entirely by the relationship type's ordered `perspectives` pair in `associations.json` (`perspectives[0]` describes the node at `a`, `perspectives[1]` the node at `b`). Authored order is preserved verbatim: there is **no lexicographic endpoint sorting** and no `directedFrom` field.
- **Relative semantics come from tuple position + the type's per-endpoint display labels** — never from slug comparison, endpoint sorting, or a stored direction flag.
- **Association ids are opaque ULIDs.** Perspective entries are display labels only (string title or `{ title, linkAdd?, linkExisting? }`); machine identity for directed edges is `associationId:endpointIndex`.
- **Set-trait** associations expand to dual projections (`ULID:0` / `ULID:1`). Parent/child indices and which association applies come from the `set` trait and view/caller context — see [sets.md](./sets.md).
- **Symmetric** types (same label on both endpoints) carry no directional meaning, so tuple order is irrelevant for them; UI resolves association context via the relation column's target database.
- **Peer / structural / taxonomy links** each have their own association id with a two-perspective definition and optional `endpoints`.
- **Single-endpoint (unidirectional) types are forbidden.** Every entry in `associations.json` defines a `perspectives` **tuple of exactly two** label configs (typed `PerspectivePair`); there is no `bidirectional` field, and the parser rejects any type that does not have exactly two perspectives. All relationships are bidirectional by construction. The write path (`resolveAssociationIdForLink`) resolves via association ULID, directed projection type, or table-schema relation column, and throws `LinkResolutionError` or `UnknownAssociationError` otherwise. See `packages/tome-db/scripts/audit-relationship-resolution.ts` to verify a content directory has no unresolvable entries.
- Record id: `{a}:{b}:{type}` (keyed on authored tuple order, so it is order-sensitive).

**SQLite cache (denormalized):** expanded on sync for fast directed queries:

| Table | Role |
| --- | --- |
| `relationship_records` | Mirror of content records |
| `relationship_projections` | Directed rows `(source, target, local_type)` — hot path for queries |
| `nodes` | Entity property bags; `is_archived` denormalized flag (recomputed on sync) |
| `meta` | Schema version, content mtime, enum config fingerprint |

**Archive membership:** a page is archived when it has set membership on the Archive hub node (`01KWN86X6MFZQAJ1V36T95928S`). Archiving (`POST /api/nodes/:id/archive`) **moves** the node markdown into `content/archive/nodes/`, moves every other incident relationship file into `content/archive/relationships/`, then adds the hub membership edge in the live relationship tree. Unarchiving reverses those moves when the other endpoint is not still archived.

**Archived relationships in content:** files under `content/archive/relationships/` are kept in git but **excluded** from SQLite sync (only the live `content/data/relationships/` tree is expanded). Hub membership edges stay live so `nodes.is_archived` can be recomputed. Search and `nodes.is_archived` exclude archived pages; graph export also excludes archived nodes.

**Enum properties in cache:** keys declared in [`content/model/schema.json`](../../content/model/schema.json) `enums` (e.g. `priority`) are stored in SQLite relationship `properties` JSON as **0-based indices** into the enum’s `options` array. Git-tracked relationship shard files keep **string labels**. Encode on cache write and decode on cache read (`packages/tome-db/src/enum-codec.ts` injected as the cache `propertyCodec`). Changing enum `options` order in `schema.json` triggers a relationship cache re-sync (store change events + `enum_config_fingerprint` meta check). After pulling enum-cache changes or a `SCHEMA_VERSION` bump, run `bun run content:sync` (or restart the editor API) to rebuild the cache from content.

Type-table behavior is inferred from `is_a` usage and schema metadata (`isTypeTableNode` in `node-capabilities.ts`).

- Node ids **must** be canonical uppercase 26-char ULIDs (`[0-9A-HJKMNP-TV-Z]{26}`), minted by `generateNodeId()` in `node-create.ts`. They are compared as exact strings — no case/dash normalization.
- Association ids **must** use the same ULID alphabet (never lowercased). Perspective entries are display labels only (not machine ids).
- Directed projection types **must** be `{associationId}:{0|1}`.
- Projection ids **must** be deterministic: `{source_id}:{type}:{target_id}` (local projection type).

### Markdown body links

Node cross-references in markdown `body` use two storage forms (see `tome-flatfile` markdown-links and dynamic-node-links):

| Form | Example | Title source |
| --- | --- | --- |
| Static | `[Custom label](./{nodeId}.md)` | Stored anchor text |
| Dynamic | `[[{nodeId}]]` | Target node `properties.title` at render time |

Helpers: `expandDynamicNodeLinks`, `collapseDynamicEditorLinks`, `findMarkdownLinksToTarget` (includes dynamic syntax for backlinks). One-time migration converts static links whose anchor text matches the target node's `properties.title` or `properties.alias` (accent/case-insensitive; markdown emphasis stripped from anchor text). Custom anchor text is left static. Run: `bun scripts/migrate-static-links-to-dynamic.ts [--dry-run]`.

### Type tables and rows

| Concept | Graph representation |
| --- | --- |
| Type table | Node id in `table-schemas.json` (column defs) + optional `is_a` incoming edges |
| Row / type instance | Relationship `(member)-[:is_a {…}]->(set)` with scalar props from `table-schemas.json` on the edge; `(set)-[:members]->(member)` is the inverse projection |
| Relation column | Outgoing relationships from the row page; scoped by row `is_a` membership |
| Stored scalars | Keys from `table-schemas.json` columns, values on `is_a` edge properties |

Database table **relation columns** are scoped by the row node's **`is_a` membership** in the viewing database—not by per-edge `via_database` / `via_view` / membership `view` properties (removed; see marloth-story `scripts/migrate-remove-view-props.ts`).

Consolidate legacy dual directed edges with `bun scripts/consolidate-relationships.ts` (already run on the corpus). Migrate associative composites to `includes` with `bun scripts/migrate-to-includes.ts` (already run on the corpus).

### Schema versioning

- `meta.schema_version` **must** record the graph DDL version (`packages/tome-sqlite/src/schema.ts`).
- Breaking schema changes **must** bump `SCHEMA_VERSION` and document migration steps.

## Behavior / API

**Read paths (phase 3):** Editor and static-site read modules accept **`TomeGraphStoreQueryable`** / **`RelationshipReadStore`** (`tome-db/src/graph-store/relationship-read.ts`) — not direct `GraphDatabase` access.

**Write paths (phase 4):** Domain mutation modules persist and validate through **`ctx.graphStore`** (`tome-db/src/graph-store/relationship-write.ts`) — not `ctx.store` or cache read-assist. SQLite cache remains the **`executeImp` SQL backend** and **`CacheSync`** target via `TomeWriteContext.cache`. See [graph-store.md](./graph-store.md).

`GraphDatabase` (`packages/tome-sqlite/src/graph.ts`) — cache / legacy tests:

- `upsertNode(id, properties)` — create or merge node
- `listRelationshipsFromSource` / `listRelationshipsToTarget` — query projection table by local perspective type
- `getNodeDetail` / `getNodePageDetail` — inspection; the latter adds **metadata** and ordered **sections** (markdown, database table, relation tables). Optional `rows` (`limit`/`offset`/`q`/`sorts`) windows multi-row sections for the editor.
- `getDatabaseViewDetail` / `getRelationTableSection` — multi-row tables with the same optional window query; responses include `rowsWindow` (see [views.md](./views.md) § Lazy-loaded rows)
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
| `packages/tome-sqlite/src/schema.ts` | DDL and version |
| `packages/tome-sqlite/src/graph.ts` | GraphDatabase API (reads projections) |
| `packages/tome-flatfile/src/content/relationships-file.ts` | Per-edge relationship JSON parse/serialize (ordered `(a, b)` tuples) |
| `packages/tome-flatfile/src/migrations/relationship-order.ts` | Reorder tuples into meaningful `(index0, index1)` order; bump v2→v3 |
| `packages/tome-flatfile/src/content/associations-file.ts` | `associations.json` parse/serialize + composite helpers |
| `packages/tome-flatfile/src/associations/load.ts` | Cached `associations.json` loader |
| `packages/tome-db/src/association-label.ts` | `perspectiveDisplayLabel`, `perspectiveLinkAddLabel` |
| `packages/tome-db/src/content/relationship-sync-expand.ts` | Content → SQLite projection expansion |
| `packages/tome-db/src/content/sync.ts` | Cache rebuild; subscribes to store change events |
| `packages/tome-db/src/graph-export.ts` | Full graph and Graph Explorer LOD export |
| `packages/tome-db/src/node-page-sections.ts` | Universal page sections |
| `packages/tome-db/src/database-view-relations.ts` | Relation-column hydration |
| `packages/tome-db/src/table-presentation/` | Scope / group / reorder layers composed onto database views |
| `packages/tome-flatfile/src/table-schemas/load.ts` | `table-schemas.json` loader |

## See also

- [sets.md](./sets.md) — set trait, type tables, archive hub
- [schema.md](./schema.md) — workspace model config in `content/model/schema.json`
- [graph-explorer.md](./graph-explorer.md) — anchor-scoped LOD graph visualization
- [table-presentation.md](./table-presentation.md) — scope tabs, row groups, and automatic sequence on Items tables
- [`../ontology.md`](../ontology.md) — design domain model (storage-agnostic)
- [`packages/tome-db/AGENTS.md`](../../packages/tome-db/AGENTS.md)
- [`AGENTS.md`](../../AGENTS.md) — project purpose, terminology, modeling direction

## Future expansion

- **Multi-dimensional slicing** — product is one axis today; expect additional dimensions (arc, medium, audience, etc.) as types, properties, or relationships.
- **Weighted relationships** — e.g. feature↔inspiration strength as a numeric relationship property rather than a boolean link.
