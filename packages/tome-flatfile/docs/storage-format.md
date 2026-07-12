# Tome flatfile storage format

Normative on-disk contract for a Tome **content root**. External projects can author a compatible tree without using Tome packages; Tome’s parsers under `packages/tome-flatfile/src/` implement this contract.

This document specifies **bytes under `content/`**. It does not cover SQLite caches, HTTP APIs, or editor UI behavior. For tooling semantics (set membership expansion, table views, etc.), see the feature docs under `docs/features/`.

## Content root layout

The content root is a directory conventionally named `content/`. Tools discover it via `TOME_CONTENT_PATH` (or by walking up from the process CWD looking for a `content/` directory). Point env vars at the **content root**, not at `content/data`.

```
{contentRoot}/
  data/                          # instance data
    relationships.json           # relationship records (v3)
    {shard}/                     # two-char ULID entropy dirs
      {nodeId}.md                # one node per file
  model/                         # workspace model (flat JSON)
    workspace.json
    associations.json
    schema.json
    table-schemas.json
    views.json
    dynamic-fields.json
    ordered-collections.json
    extensions.json
```

| Area | Role |
| --- | --- |
| `data/` | Git-tracked nodes and relationship instances |
| `model/` | Git-tracked workspace configuration |

A sibling query cache (e.g. `{contentRoot}/../data/tome.sqlite`) is **derived** and outside this format.

**Invariants**

- Node markdown lives only under shard subdirectories of `data/`. Files at `data/*.md` are not part of the layout and are ignored by Tome’s store.
- `model/` JSON files sit directly under `model/` (no nesting).
- Encoding is UTF-8. JSON files use 2-space indent and a trailing newline.

## Node IDs and sharding

| Rule | Detail |
| --- | --- |
| Alphabet | Uppercase Crockford Base32 ULID: `[0-9A-HJKMNP-TV-Z]{26}` (excludes I, L, O, U) |
| Comparison | Exact string match; no case or dash normalization |
| Basename | `{nodeId}.md` |
| Shard | First two **entropy** characters: `nodeId.slice(10, 12)` (skip the 10-character timestamp prefix) |
| Relative path | `data/{shard}/{nodeId}.md` |

Example: `01KWN86X6KNBWXKBG5EGFMQJXA` → shard `NB` → `data/NB/01KWN86X6KNBWXKBG5EGFMQJXA.md`.

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

## `relationships.json` (version 3)

Path: `data/relationships.json`.

```json
{
  "version": 3,
  "relationships": [
    {
      "a": "01EXAMPLESETNODEID000000001",
      "b": "01EXAMPLEMEMBERNODEID0000001",
      "type": "member_of"
    },
    {
      "a": "01EXAMPLENODEA00000000000001",
      "b": "01EXAMPLENODEB00000000000001",
      "type": "scenes_parts",
      "archived": true,
      "properties": { "ordinal": 0 }
    }
  ]
}
```

### Wrapper

| Field | Type | Notes |
| --- | --- | --- |
| `version` | number | Current format version is **3** (required) |
| `relationships` | array | Required. On read, legacy key `connections` is accepted as an alias |

### Entry

| Field | Type | Notes |
| --- | --- | --- |
| `a` | string | Endpoint at tuple index 0 (ULID) |
| `b` | string | Endpoint at tuple index 1 (ULID) |
| `type` | string | Storage composite type (normalized on read) |
| `archived` | boolean | Optional; omit unless `true` |
| `properties` | object | Optional; omit when empty |

**Ordered tuple, not named source/target.** Positions `a`/`b` have no inherent direction. Meaning comes from `associations.json` `perspectives[0|1]`. Do not lexicographically sort endpoints.

**Type normalization:** trim → lowercase → `-` → `_`.

**Record identity (runtime, not stored):** `{a}:{b}:{type}` after type normalization.

**Serialize:** pretty-print JSON (indent 2) + trailing newline; omit empty `properties`; omit `archived` unless `true`.

**Archive flag:** `archived: true` keeps the edge in git content. Tome’s SQLite sync skips archived edges (except archive-hub membership used to compute archived status). That sync policy is outside this format; the on-disk flag is part of the content contract.

**Enums:** when a property is an enum declared in `schema.json`, store the **string label** in `properties` (not a numeric index).

## Model files

All model files live under `model/`. Unless noted, serialize as JSON indent 2 + trailing newline. Relationship type and perspective slugs use the same normalization as relationship `type` fields.

### `associations.json` (version 1)

Registry of composite storage types.

```json
{
  "version": 1,
  "types": {
    "member_of": {
      "perspectives": ["members", "member_of"],
      "perspectiveLabels": {
        "member_of": { "title": "Membership", "linkAdd": "Link type table" }
      },
      "traits": ["set"]
    },
    "ordered_member_of": {
      "perspectives": ["ordered_members", "ordered_member_of"],
      "traits": ["set", "ordered"]
    }
  }
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `types` | object keyed by composite type slug |

Each type definition:

| Field | Required | Notes |
| --- | --- | --- |
| `perspectives` | yes | Exactly two strings: `[index0, index1]`. Describes the node at tuple positions `a` and `b` |
| `perspectiveLabels` | no | Map perspective slug → string title, or `{ title, linkAdd?, linkExisting? }` |
| `linkExisting` | no | boolean; UI default for link-existing controls |
| `traits` | no | Array of flag strings or `{ key, ...config }` objects; trait keys unique per type |
| `endpoints` | no | `{ "0": { "typeId": "<ULID>" }, "1": { "typeId": "<ULID>" } }` — allowed `is_a` type node at each endpoint |

**Set association orientation (example):** for a set-trait type with perspectives `["members", "member_of"]` — **set at `a` (index 0), member at `b` (index 1)**. An ordered set association uses the same parent/child indices with traits `set` and `ordered`. Project association slugs (e.g. Marloth `member_of` / `ordered_member_of`) are not Tome defaults.

Serialize sorts type keys and sorts traits (string flags before object entries) for stable diffs.

Composite keys are often formed as `{p1}_{p2}` with reverse-lexicographic sort of the two perspective names (e.g. helpers that register bidirectional types).

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
        { "key": "related", "name": "Related", "type": "relation", "association": "related_to" }
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
      "properties": { "columnOrder": ["name", "status"] },
      "hiddenColumns": ["internal_key"]
    },
    {
      "nodeId": "01EXAMPLETYPENODEID000000001",
      "association": "member_of",
      "generator": "some_provider"
    }
  ]
}
```

**Custom view:** `{ id, nodeId, association, name, sorts, properties?, hiddenColumns? }`

- `sorts`: `{ column, direction: "asc"|"desc" }[]`
- `properties.columnOrder`: optional string array
- Unique custom key: `(nodeId, association, id)`

**Generated view:** `{ nodeId, association, generator }` — must not include `id`, `name`, or `sorts`.

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

### `dynamic-fields.json` (version 1)

Bindings for computed table columns. Parser validates the wrapper; entry fields are conventional.

```json
{
  "version": 1,
  "fields": [
    {
      "id": "word-count",
      "databaseId": "01EXAMPLETYPENODEID000000001",
      "columnKey": "word_count",
      "columnName": "Word count",
      "columnType": "number",
      "resolverId": "word_count",
      "docsPath": "docs/dynamic-fields/word-count.md",
      "enabled": true,
      "params": {},
      "viewNames": ["all"]
    }
  ],
  "columnSets": [
    {
      "id": "metric-set",
      "databaseId": "01EXAMPLETYPENODEID000000001",
      "columnKeyPattern": "metric_{id}",
      "columnNamePattern": "Metric {name}",
      "columnType": "number",
      "resolverId": "metric_set",
      "docsPath": "docs/dynamic-fields/metric-set.md",
      "enabled": true
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `version` | number, required |
| `fields` | array of field entries |
| `columnSets` | array of column-set entries |

**Field entry:** `id`, `databaseId`, `columnKey`, `columnName`, `columnType`, `resolverId`, `docsPath`, `enabled`, optional `params`, `viewNames`.

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
      "scopeCompositeType": "book_scenes",
      "groupCompositeType": "chapter_scenes",
      "partProductCompositeType": "scene_products",
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
| `data/{shard}/{id}.md` | required | At least home, archive, and any referenced nodes |
| `data/relationships.json` | required | May be `{ "version": 3, "relationships": [] }` |
| `model/associations.json` | required | At least types you use (often include `member_of`) |
| `model/workspace.json` | required | Home, archive, anchors, quick links |
| `model/schema.json` | optional | Needed when using enums / rules |
| `model/table-schemas.json` | optional | Needed for type-table columns |
| `model/views.json` | optional | Needed for custom/generated table tabs |
| `model/dynamic-fields.json` | optional | Computed columns |
| `model/ordered-collections.json` | optional | Ordered collection UIs |
| `model/extensions.json` | optional | Extension packages |

A Tome-compatible writer should:

1. Use uppercase ULID node ids and the entropy shard path rule.
2. Write valid frontmatter + body node files.
3. Store relationships as v3 ordered `(a, b, type)` tuples with normalized type slugs.
4. Keep enum labels as strings in relationship properties.
5. Align tuple orientation with `perspectives` in `associations.json`.

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
| Dynamic fields | `src/content/dynamic-fields-file.ts` |
| Ordered collections | `src/ordered-collections-config/ordered-collections-file.ts` |
| Extensions | `src/extensions/extensions-file.ts` |
| Body link forms | `src/markdown-links.ts`, `src/dynamic-node-links.ts` |
| Set / ordered traits | `src/association-traits.ts` |

Related behavioral docs (not format contracts): `docs/features/tome-db.md`, `sets.md`, `schema.md`, `views.md`, `table-schemas.md`, `ordered-collections.md`, `extensions.md`, `dynamic-table-fields.md`.
