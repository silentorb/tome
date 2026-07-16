# Tome flatfile storage format

Normative on-disk contract for a Tome **content root**. External projects can author a compatible tree without using Tome packages; Tome’s parsers under `packages/tome-flatfile/src/` implement this contract.

This document specifies **bytes under `content/`**. It does not cover SQLite caches, HTTP APIs, or editor UI behavior. For tooling semantics (set membership expansion, table views, etc.), see the feature docs under `docs/features/`.

## Content root layout

The content root is a directory conventionally named `content/`. Tools discover it via `TOME_CONTENT_PATH` (or by walking up from the process CWD looking for a `content/` directory). Point env vars at the **content root**, not at `content/data`.

```
{contentRoot}/
  data/                          # live instance data
    nodes/
      {shard}/                   # two-char ULID entropy dirs
        {nodeId}.md
    relationships/
      {shard}/                   # two-char SHA-256 digest prefix
        {digestRest}.json
  archive/                       # archived instance data
    nodes/
      {shard}/
        {nodeId}.md
    relationships/
      {shard}/
        {digestRest}.json
  model/                         # workspace model (flat JSON)
    workspace.json
    associations.json
    schema.json
    table-schemas.json
    views.json
    dynamic-properties.json
    ordered-collections.json
    extensions.json
```

| Area | Role |
| --- | --- |
| `data/nodes/` | Live node markdown |
| `data/relationships/` | Live relationship instances |
| `archive/nodes/` | Archived node markdown |
| `archive/relationships/` | Archived relationship instances |
| `model/` | Git-tracked workspace configuration |

A sibling query cache (e.g. `{contentRoot}/../data/tome.sqlite`) is **derived** and outside this format.

**Invariants**

- Live nodes live only under `data/nodes/{shard}/`. Archived nodes live only under `archive/nodes/{shard}/`.
- Live relationships live under `data/relationships/`; archived under `archive/relationships/`. There is no monolithic `relationships.json`.
- `model/` JSON files sit directly under `model/` (no nesting).
- Encoding is UTF-8. JSON files use 2-space indent and a trailing newline.

## Node IDs and sharding

| Rule | Detail |
| --- | --- |
| Alphabet | Uppercase Crockford Base32 ULID: `[0-9A-HJKMNP-TV-Z]{26}` (excludes I, L, O, U) |
| Comparison | Exact string match; no case or dash normalization |
| Basename | `{nodeId}.md` |
| Shard | First two **entropy** characters: `nodeId.slice(10, 12)` (skip the 10-character timestamp prefix) |
| Relative path | `data/nodes/{shard}/{nodeId}.md` (live) or `archive/nodes/{shard}/{nodeId}.md` |

Example: `01KWN86X6KNBWXKBG5EGFMQJXA` → shard `NB` → `data/nodes/NB/01KWN86X6KNBWXKBG5EGFMQJXA.md`.

The node id is the **filename stem**. It is not required inside frontmatter.

## Node markdown

Each node file is YAML frontmatter delimited by `---`, followed by an optional markdown body.

```markdown
---
title: Example scene
alias: Scene 3
---
Body text goes here.
```

### Parse rules

- Optional UTF-8 BOM (`U+FEFF`) is stripped before parse.
- The file must match: leading `---`, YAML block, closing `---`, then optional body (CRLF or LF line endings accepted on read).
- Frontmatter must be a YAML **mapping** (object).
- Frontmatter key `labels` is ignored on read (not stored as a property).
- All other frontmatter keys become node properties.
- The markdown body is **not** a frontmatter field on disk. In-memory Tome loads may inject `properties.body`; serializers must write the body after the closing `---` and must not put `body` in the YAML block.

### Serialize rules

- YAML via a standard YAML emitter with `lineWidth: 0` (no forced wrapping).
- Body newlines normalized to LF; non-empty body ends with a trailing newline.
- Empty body → frontmatter-only file ending with `---\n`.

### Properties

There is **no fixed frontmatter schema**. Property values are JSON-compatible scalars, arrays, or objects (`string | number | boolean | null | array | object`).

Common conventions (not required by the format):

| Key | Typical use |
| --- | --- |
| `title` | Display name |
| `alias` | Alternate display name |
| `url_alias` | Static-site URL slug |

Scalar table-row values usually live on **relationship** `properties`, not on node frontmatter.

### Body links

Canonical forms authored in markdown bodies:

| Form | Meaning |
| --- | --- |
| `[label](./{nodeId}.md)` | Static link to another node |
| `[[{nodeId}]]` | Dynamic-titled wiki link (title resolved at display time) |

Tome tools may also resolve legacy hrefs (`tome:{id}`, `tome://node/{id}`, query params `node` / `record` / `dynnode`). New content should use the two canonical forms above.

## Relationships (version 4)

One relationship per file under `data/relationships/` (live) or `archive/relationships/` (archived). Archive status is **path location**, not a JSON field.

```
data/relationships/{shard}/{digestRest}.json
archive/relationships/{shard}/{digestRest}.json
```

### Path derivation

1. Decode each of `a`, `b`, `type` from Crockford Base32 ULID → 16 bytes.
2. Concatenate **authored order**: `bytes(a) ‖ bytes(b) ‖ bytes(type)` (48 bytes).
3. SHA-256 → 64 uppercase hex chars.
4. `{shard}` = first two hex chars; `{digestRest}` = remaining 62 hex chars.

Identity is the composite key `(a, b, type)` (order-sensitive). There is **no** stored relationship id field.

### Per-file JSON

```json
{
  "a": "01EXAMPLESETNODEID000000001",
  "b": "01EXAMPLEMEMBERNODEID0000001",
  "type": "01EXAMPLEASSOCIATIONID00001",
  "properties": { "ordinal": 0 }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `a` | string | Endpoint at tuple index 0 (ULID) |
| `b` | string | Endpoint at tuple index 1 (ULID) |
| `type` | string | Association ULID (trim only on read) |
| `properties` | object | Optional; omit when empty |

**Ordered tuple, not named source/target.** Positions `a`/`b` have no inherent direction. Meaning comes from `associations.json` `perspectives[0|1]`. Do not lexicographically sort endpoints.

**Record identity (runtime, not stored):** `{a}:{b}:{type}` after type normalization.

**Serialize:** pretty-print JSON (indent 2) + trailing newline; omit empty `properties`.

**Archive:** moving a file into `archive/relationships/` soft-hides the edge. Tome’s SQLite sync reads the **live** tree only. Archive-hub membership edges stay in the live tree so `nodes.is_archived` can be recomputed. Archiving a **node** also moves its markdown into `archive/nodes/`.

**Enums:** when a property is an enum declared in `schema.json`, store the **string label** in `properties` (not a numeric index).

## Model files

All model files live under `model/`. Unless noted, serialize as JSON indent 2 + trailing newline. Association ids are ULIDs (no case folding). Perspective entries are display labels only.

### `associations.json` (version 1)

Registry of associations keyed by **opaque ULID** ids. Perspective entries are display labels only; directed cache identity is `associationId:endpointIndex`.

```json
{
  "version": 1,
  "associations": {
    "01EXAMPLEASSOCIATIONID0001": {
      "perspectives": [
        "Members",
        { "title": "Membership", "linkAdd": "Link type table" }
      ],
      "traits": ["set"]
    },
    "01EXAMPLEASSOCIATIONID0002": {
      "perspectives": ["Ordered members", "Ordered membership"],
      "traits": ["set", "ordered"]
    }
  }
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `associations` | object keyed by association ULID |

Each type definition:

| Field | Required | Notes |
| --- | --- | --- |
| `perspectives` | yes | Exactly two label configs: string title or `{ title, linkAdd?, linkExisting? }` for endpoints 0 and 1 |
| `linkExisting` | no | boolean; UI default for link-existing controls |
| `traits` | no | Array of flag strings or `{ key, ...config }` objects; trait keys unique per type |
| `endpoints` | no | `{ "0": { "typeId": "<ULID>" }, "1": { "typeId": "<ULID>" } }` — allowed `is_a` type node at each endpoint |

**Set association orientation (example):** for a set-trait type with labels `["Members", "Membership"]` — **set at `a` (index 0), member at `b` (index 1)**. Cache projections use `{associationId}:0` / `{associationId}:1`. An ordered set association uses the same parent/child indices with traits `set` and `ordered`.

Serialize sorts type keys and sorts traits (string flags before object entries) for stable diffs.

### `schema.json` (version 1)

Enums and optional relationship rules.

```json
{
  "version": 1,
  "relationshipRules": [],
  "enums": {
    "priority": {
      "options": ["low", "medium", "high"],
      "default": "medium",
      "defaultOrder": "asc"
    }
  }
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `relationshipRules` | array (optional; default empty). Endpoint constraints increasingly live on `associations.json` `endpoints` instead |
| `enums` | object (optional; default `{}`) |

**Relationship rule entry**

| Field | Notes |
| --- | --- |
| `id` | non-empty string |
| `sourceTypeId` | type node id |
| `type` | relationship type slug (legacy key `label` accepted on read) |
| `allowedTargetTypeIds` | string array |

**Enum definition**

| Field | Notes |
| --- | --- |
| `options` | non-empty string array; order is sort/index order |
| `default` | must be one of `options` |
| `defaultOrder` | `"asc"` \| `"desc"` (default `"asc"`) — UI dropdown order |
| `values` | optional map of option → number; keys ⊆ `options` |

### `table-schemas.json` (version 1)

Column definitions for type tables (keys are type-node ULIDs).

```json
{
  "version": 1,
  "tables": {
    "01EXAMPLETYPENODEID000000001": {
      "columns": [
        { "key": "name", "name": "Name", "type": "text" },
        { "key": "status", "name": "Status", "type": "select", "enumId": "priority" },
        { "key": "related", "name": "Related", "type": "relation", "association": "<association-ulid>" }
      ]
    }
  }
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `tables` | object; each key must be a valid node ULID |

**Table schema**

| Field | Notes |
| --- | --- |
| `columns` | array; column `key` unique within the table |

**Scalar column:** `{ key, name, type, enumId? }` where `type` is one of:

`checkbox` | `date` | `email` | `files` | `multi_select` | `number` | `phone_number` | `rich_text` | `select` | `status` | `text` | `url`

**Relation column:** `{ key, name, type: "relation", association }`

### `views.json` (version 2)

Strict version **2**. Table tab definitions (custom and generated).

```json
{
  "version": 2,
  "views": [
    {
      "id": "all",
      "nodeId": "01EXAMPLETYPENODEID000000001",
      "association": "member_of",
      "name": "All",
      "sorts": [{ "column": "name", "direction": "asc" }],
      "properties": ["name", "status"]
    },
    {
      "nodeId": "01EXAMPLETYPENODEID000000001",
      "association": "member_of",
      "generator": "some_provider",
      "properties": ["name", "status"]
    }
  ]
}
```

**Custom view:** `{ id, nodeId, association, name, sorts, properties? }`

- `sorts`: `{ column, direction: "asc"|"desc" }[]`
- `properties`: optional string array of visible column keys in display order (absent → all columns, default order)
- Unique custom key: `(nodeId, association, id)`

**Generated view:** `{ nodeId, association, generator, properties? }` — must not include `id`, `name`, or `sorts`. Shared `properties` apply to all tabs from the generator.

Do not mix generated and custom views for the same `(nodeId, association)` pair. At most one generated view per pair.

### `workspace.json` (version 1)

Strict version **1**. Workspace identity and navigation anchors.

```json
{
  "version": 1,
  "homeNodeId": "01EXAMPLEHOMENODEID000000001",
  "archiveNodeId": "01EXAMPLEARCHIVENODEID000001",
  "protectedNodeIds": [
    "01EXAMPLEHOMENODEID000000001",
    "01EXAMPLEARCHIVENODEID000001"
  ],
  "graphExplorer": {
    "defaultAnchorNodeId": "01EXAMPLEANCHORNODEID000001"
  },
  "staticSite": {
    "homeNodeId": "01EXAMPLEHOMENODEID000000001"
  },
  "quickLinks": [
    {
      "nodeId": "01EXAMPLELINKNODEID000000001",
      "label": "Features",
      "icon": "folder"
    }
  ]
}
```

**Required**

| Field | Notes |
| --- | --- |
| `version` | must be `1` |
| `homeNodeId` | ULID |
| `archiveNodeId` | ULID |
| `protectedNodeIds` | ULID array |
| `graphExplorer.defaultAnchorNodeId` | ULID |
| `staticSite.homeNodeId` | ULID |
| `quickLinks` | array of `{ nodeId, label, icon }` (legacy `sidebar.links` accepted on read) |

**Optional**

| Field | Notes |
| --- | --- |
| `branding` | `appTitle`, `defaultDocumentIcon`, `staticSiteHeader`, `staticSiteFooter`, `staticSiteFooterOrganization` |
| `legacy` | `exportPathPrefix`, `archivePathPrefix` |
| `editor.markdownBodyPanel` | boolean |
| `spatialGraph.nodeDimensionScale` | `{ x?, y? }` positive finite numbers |
| `schemaDiagram.memberBadgePosition` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` |

### `dynamic-properties.json` (version 1)

Bindings for computed type-table columns. Parser validates the wrapper; entry fields are conventional.

```json
{
  "version": 1,
  "properties": [
    {
      "id": "01EXAMPLEPROPERTYID000000001",
      "owner": "01EXAMPLETYPENODEID000000001",
      "columnKey": "word_count",
      "columnName": "Word count",
      "columnType": "number",
      "resolverId": "word_count",
      "params": {}
    }
  ],
  "columnSets": [
    {
      "id": "01EXAMPLECOLUMNSETID00000001",
      "owner": "01EXAMPLETYPENODEID000000001",
      "columnKeyPattern": "metric_{id}",
      "columnNamePattern": "Metric {name}",
      "columnType": "number",
      "resolverId": "metric_set"
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `properties` | array of property entries |
| `columnSets` | array of column-set entries |

**Property entry:** `id` (ULID), `owner` (type-table / set node id), `columnKey`, `columnName`, `columnType`, `resolverId`, optional `params`. Spec docs live under `docs/dynamic-properties/` by convention from `resolverId`. Column visibility in table views is controlled by view `properties` allowlists in `views.json`, not binding-level view names.

**Column-set entry:** same pattern with `columnKeyPattern` / `columnNamePattern` instead of fixed keys/names.

### `ordered-collections.json` (version 1)

Configs for ordered part/group associations (e.g. scenes by book).

```json
{
  "version": 1,
  "configs": [
    {
      "id": "scenes-by-book",
      "typeDatabaseId": "01EXAMPLESCENETYPENODE000001",
      "scopeCompositeType": "01EXAMPLEASSOCIATIONID00003",
      "groupCompositeType": "01EXAMPLEASSOCIATIONID00004",
      "partProductCompositeType": "01EXAMPLEASSOCIATIONID00005",
      "groupTypeDatabaseId": "01EXAMPLECHAPTERTYPENODE0001",
      "unassignedGroupTitle": "Unassigned",
      "columnViewName": "all",
      "excludedColumnKeys": ["internal"]
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `version` | must be `1` |
| `configs` | array; `id` unique |

**Config fields:** `id`, `typeDatabaseId`, `scopeCompositeType`, `groupCompositeType`, `partProductCompositeType`, `groupTypeDatabaseId`, `unassignedGroupTitle`; optional `columnViewName`, `excludedColumnKeys`.

Both `typeDatabaseId` and `groupTypeDatabaseId` must be set nodes whose set association (from views / `setRolePerspectivesForNode`) has the **ordered** trait in `associations.json`.

### `extensions.json` (version 1)

Runtime extension registration. Version defaults to `1` if omitted on read.

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "my-extension",
      "label": "My extension",
      "enabled": true,
      "editorModule": "@scope/my-extension/editor",
      "htmlModule": "@scope/my-extension/html",
      "serverModule": "@scope/my-extension/server",
      "params": {}
    }
  ],
  "components": [
    {
      "id": "my-block",
      "extensionId": "my-extension",
      "kind": "page-block",
      "implementationId": "MyBlock",
      "label": "My block",
      "enabled": true,
      "slashMenu": { "group": "Custom", "order": 10 },
      "params": {}
    }
  ]
}
```

**Extension entry:** `id`, `enabled` (default true); optional `label`, `editorModule`, `htmlModule`, `serverModule`, `params`.

**Component entry:** `id`, `extensionId`, `kind` (must be `"page-block"`), `implementationId`, `label`, `enabled`; optional `slashMenu` (`group?`, `order?`), `params`.

## Minimal compatible corpus

| File / path | Minimal graph | Notes |
| --- | --- | --- |
| `data/{shard}/{id}.md` | required | Prefer `data/nodes/{shard}/{id}.md` (at least home, archive, and any referenced nodes) |
| `data/nodes/` + `data/relationships/` | required | Live instance trees (may be empty of relationships) |
| `archive/nodes/` + `archive/relationships/` | optional | Archived instance trees |
| `model/associations.json` | required | At least associations you use (ids are ULIDs) |
| `model/workspace.json` | required | Home, archive, anchors, quick links |
| `model/schema.json` | optional | Needed when using enums / rules |
| `model/table-schemas.json` | optional | Needed for type-table columns |
| `model/views.json` | optional | Needed for custom/generated table tabs |
| `model/dynamic-properties.json` | optional | Computed columns |
| `model/ordered-collections.json` | optional | Ordered collection UIs |
| `model/extensions.json` | optional | Extension packages |

A Tome-compatible writer should:

1. Use uppercase ULID node ids and the entropy shard path rule.
2. Write valid frontmatter + body node files.
3. Store each relationship as one JSON file under `data/relationships/{shard}/{digest}.json` (path from SHA-256 of authored `a‖b‖type` bytes).
4. Keep enum labels as strings in relationship properties.
5. Align tuple orientation with `perspectives` in `associations.json`.
6. Place soft-hidden edges under `archive/relationships/` and archived nodes under `archive/nodes/` (no `archived` JSON field).

## Non-goals

This format does **not** specify:

- SQLite table schemas, WAL sidecars, or cache rebuild
- Directed relationship **projections** expanded from composite types
- Enum label ↔ index encoding used only in the cache
- HTTP/API routes, editor UX, or extension module implementations
- Domain ontology (what nodes mean in a particular project)

## Implementation pointers

Normative parsers and path helpers in this package:

| Concern | Source |
| --- | --- |
| Paths, shards, filenames | `src/content/paths.ts` |
| Node id regex / minting | `src/node-id.ts` |
| Node markdown | `src/content/node-file.ts` |
| Relationships v3 | `src/content/relationships-file.ts` |
| Type slug normalization | `src/relation-type.ts` |
| Associations | `src/content/associations-file.ts` |
| Schema / enums | `src/schema-rules/schema-file.ts` |
| Table schemas | `src/content/table-schemas-file.ts` |
| Views | `src/content/views-file.ts` |
| Workspace | `src/workspace/workspace-file.ts` |
| Dynamic properties | `src/content/dynamic-properties-file.ts` |
| Ordered collections | `src/ordered-collections-config/ordered-collections-file.ts` |
| Extensions | `src/extensions/extensions-file.ts` |
| Body link forms | `src/markdown-links.ts`, `src/dynamic-node-links.ts` |
| Set / ordered traits | `src/association-traits.ts` |

Related behavioral docs (not format contracts): `docs/features/tome-db.md`, `sets.md`, `schema.md`, `views.md`, `table-schemas.md`, `ordered-collections.md`, `extensions.md`, `dynamic-properties.md`.
