# Multi-corpus sessions

## Summary

A Tome process may open **one or more corpora** (content roots) behind a single `TomeDataStore` and session SQLite cache so the editor can browse, edit, and cross-link nodes across corpora without merging git trees. Each corpus has its own `content/` layout, `workspace.json` (including a required `homeNodeId`), and optional `readwrite` / `readonly` access. Callers address nodes by ULID; a backend **node → corpus** routing map decides where bytes live.

## When to read this

- Configuring more than one content root in `tome-server` / the editor
- Implementing or changing composite store, cross-corpus relationships, or active-corpus UI
- Understanding how `corpusId` relates to “project” / workspace product language

## Terminology

| Term | Meaning |
| --- | --- |
| **Corpus** | One content root (`content/`) with its own nodes, relationships, and `model/`. Unit of mixing, access mode, and editor “active” state. Stable id slug (e.g. `marloth`, `translucence`). |
| **Store** | Runtime `TomeDataStore`. A **composite store** fronts many corpora. Not user-facing chrome. |
| **Database** | SQLite cache or type-table “databases” in the editor — **not** a corpus. |
| **Project** | Workspace / product use case. Often 1:1 with a corpus today; do not equate in APIs. |
| **Active corpus** | The corpus whose Home, quick links, and branding the editor sidebar shows. |

API field: `corpusId`. Config key: `corpora`.

## Requirements

### Host shape

- `tome-server` still loads a **singular** store module and **singular** query cache.
- Flatfile `open` may receive either `contentPath` (solo corpus) or `corpora: [{ id, contentPath, access? }, …]` (two or more).
- Mixed sessions **must not** reuse any corpus’s `data/tome.sqlite`; use a dedicated session cache path (`TOME_DB_PATH`).
- Solo mode (`TOME_CONTENT_PATH` only) remains the default and must keep existing behavior.

### Routing map

- Most callers reference nodes by ULID only and **must not** need to know storage location.
- The composite owns `locateNode(id) → corpusId | null`, built from each corpus’s node inventory and updated on create/delete/sync.
- Writes for a node (body, same-corpus edges, model keys owned by that type node) route via this map.
- Cross-corpus edges use the map to choose dual-write targets.

### Access mode

- Each corpus is `"readwrite"` (default) or `"readonly"`.
- Readonly: never write nodes, relationships, or model JSON to that root; mutations return `corpus_readonly`.
- Mixed sessions may combine modes (e.g. one writable, one attached readonly).

### Ownership and writes

| Object | Destination |
| --- | --- |
| Node | Owning corpus (must be read/write) |
| Same-corpus relationship | That corpus (must be read/write) |
| Cross-corpus relationship | **Dual-write** identical `{ a, b, type, properties }` into **both** endpoint corpora; both must be read/write or refuse |
| New node (UI) | Active corpus (`corpusId` on create) |
| New node (API, no `corpusId`) | Host primary / first-listed corpus |
| Model JSON | Corpus that owns the key / type node |

- Relationship on-disk format is unchanged.
- Union reads **dedupe** relationships by `{a, b, type}` (tuple order matters).
- Disagreeing dual copies (same identity, different properties) → **boot fails**.
- Missing copy when both corpora are writable → **heal** by writing the missing file.
- Missing side readonly → do not write; edge still appears from the present copy.
- Delete / property update of a cross-edge applies to both copies, or refuses if either corpus is readonly.
- Solo corpus: cross-edge files whose other endpoint is absent are kept; cache expansion skips incomplete edges.

Boot **fails** on: duplicate node ids across corpora; duplicate association ids with conflicting definitions; enum keys with conflicting `options`; dual-edge property drift.

### Model merge (read)

Union in memory via composite `read*File()` — do not write a merged `model/`.

- Union by id: associations, table-schemas, views, dynamic-properties, extensions.
- Schema: union relationship rules and enums (with conflict rules above).
- `workspace.json` is **not** flattened. Each corpus **must** have `homeNodeId`. Session API lists corpora; editor chrome uses the **active** corpus only.
- Archive: each corpus’s `archiveNodeId`; archiving uses that node’s hub; cache recompute considers every hub.

### Editor chrome

- **Not** a mixed sidebar. One **active corpus** at a time.
- Sidebar: corpus dropdown at the top; Home / quick links / branding from the active corpus only.
- Navigating to a node sets active corpus to that node’s `corpusId`.
- Changing the dropdown **always** navigates to the selected corpus’s `homeNodeId`.
- New nodes are created in the active corpus.
- Readonly corpus / page → view-only chrome.
- Search / graph may query the union so cross-links resolve; create and chrome stay corpus-scoped.

### HTTP

- `GET /api/corpora` — id, label, home, archive, `access`.
- Node page and search hits include `corpusId` (and whether the corpus is readonly).
- `GET /api/nodes/:id` stays id-only; create may take optional `corpusId`.

## Design rationale

- Global ULIDs already allow a union without namespacing; collisions are configuration errors.
- Dual-written cross-edges keep each git tree self-describing when opened alone.
- Active-corpus chrome matches “each node belongs to one corpus” without dumping every corpus’s quick links into one sidebar.
- Decentralization / multi-writer sync are deferred; v1 fails on drift and heals missing dual copies.

## Configuration

Store options (via `tome-server.json` `store.options` or env):

```json
{
  "corpora": [
    { "id": "marloth", "contentPath": "/workspaces/marloth-story/content", "access": "readwrite" },
    { "id": "translucence", "contentPath": "/workspaces/translucence/content", "access": "readonly" }
  ]
}
```

Env convenience: `TOME_CORPORA` as `id=/abs/path[:readonly]` pairs (comma-separated). Solo: `TOME_CONTENT_PATH` only.

Session cache: set `TOME_DB_PATH` to a path outside every corpus **and inside a tree the host process can write** — in the workbench devcontainer the `tome` service mounts only the corpus repos plus `tome` and `imp`, so use `/workspaces/tome/data/tome-session.sqlite` (gitignored). A path in an unmounted repo fails at boot with `EACCES` from `mkdir`.

## Verification

- Solo session: behavior unchanged with `TOME_CONTENT_PATH` only.
- Two writable corpora: create node in active corpus; cross-link dual-writes; dropdown opens other corpus home; follow-the-node switches chrome.
- Readonly corpus: mutations targeting it return `corpus_readonly`; UI is view-only.
- Boot fails on duplicate node ids / dual-edge property drift.
- Unit tests: two temp content trees for composite store (dedupe, dual-write, heal, readonly refusal).

## Implementation pointers

| Area | Location |
| --- | --- |
| Contracts | `packages/tome-service-interfaces` (`TomeDataStoreOpenOptions.corpora`, `locateNode`, `corpora()`) |
| Composite store | `packages/tome-flatfile` |
| Sync / graph | `packages/tome-db` (`CacheSync`), `packages/tome-server` (`graph-services`) |
| HTTP | `packages/tome-http` (`GET /api/corpora`) |
| Editor | `packages/tome-editor` (sidebar dropdown, active corpus) |

## See also

- [`tome-server.md`](./tome-server.md) — host config
- [`tome-db.md`](./tome-db.md) — content + cache
- [`tome-editor.md`](./tome-editor.md) — client chrome
- [`packages/tome-flatfile/docs/storage-format.md`](../../packages/tome-flatfile/docs/storage-format.md) — on-disk layout (unchanged per corpus)
