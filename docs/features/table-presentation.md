# Table presentation

## Summary

**Table presentation** composes optional presentation layers onto a type table's Items section. A *composition* names a type database and turns on any combination of three independent layers:

| Layer | Effect |
| --- | --- |
| `scope` | Generated tabs, one per related scope node; rows filter to the active scope |
| `groups` | Rows partition into subsections keyed by a relation to a group type table |
| `sequence` | Pin rows to the intrinsic `ordered`-trait edge `order` sequence; enable drag-and-drop that **edits those edges** |

The result is still a **database section** (`DatabaseViewDetail`) — layers add `groups` and `presentation` metadata rather than producing a separate section type. The first configured composition is `scenes-by-book`: scenes scoped by book (Product), grouped by Part, and sequenced.

Intrinsic sequence is **not** view sorting: `ViewSortSpec` / column sorts use the same view plumbing as tabs and may persist in `views.json`, but they do not rewrite edge `order`. The `sequence` layer forces the shared Items member-page path to use intrinsic edge order (`intrinsicSequence`) and sets `presentation.sequenced`.

## When to read this

Read this doc when your task involves:

- Scope tabs, row groups, or intrinsic edge-sequence editing on a type table's Items section
- The `order` property on **ordered set-trait** edges
- Adding or changing a composition in `content/model/table-presentation.json`

For graph storage basics, read [tome-db.md](./tome-db.md). For view tabs and view sorts, read [views.md](./views.md). For the editor UI, read [tome-editor.md](./tome-editor.md). For Marloth domain semantics (Scene, Part, Product), read [`../ontology.md`](../ontology.md). For set / ordered traits, read [sets.md](./sets.md).

## Requirements

### Core model

- Compositions **must** be defined in `content/model/table-presentation.json`; there is no UI for adding compositions.
- A composition **must** name a `typeDatabaseId` and a unique `id`. Every layer is optional and each layer **must** work without the others.
- A database opts into a composition through `views.json`: a generated view record whose `generator` is the composition id (see [views.md](./views.md)).
- Intrinsic sequence **must** be stored in the `order` property on **ordered set-trait** edges (default key from the `ordered` trait). It **must** be treated as metadata: excluded from columns and never editable as a field cell.
- Each layer **may** declare `excludeColumnKeys`; the composition **may** declare its own. All of them union into the hidden column set, because scope tabs, group headings, and drag handles replace the columns they stand in for.

### `scope` layer

- `memberToScopeComposite` is the association between a row and its scope node.
- At read time the host **must** resolve that composite to the matching table-schema relation column key on `typeDatabaseId`, then hop via Imp semantic bind (`semanticPathFromAnchorGraph` + `executeImp`). Missing or ambiguous columns **must** fail loudly — there is no composite-SQL fallback for related-id hops.
- Tabs **must** be generated from the scope nodes that actually have rows; the first tab is active by default.
- Rows **must** filter to the active scope.
- Sequence is **scoped**: with `sequence` also enabled, intrinsic order applies within the active scope, not globally across the database.

### `groups` layer

- `memberToGroupComposite` links a row to its group node; `groupTypeDatabaseId` is the group type table.
- Related-id hops for row→group and optional `groupToScopeComposite` **must** use the same Imp semantic path pipeline (column key on the appropriate start type).
- Group headers **must** sort by the group's own ordered-set edge `order`, with the `unassignedGroupTitle` group always last.
- `groupToScopeComposite` (optional) restricts visible groups to those linked to the active scope.
- `canonicalGroupByTitle` (default on) resolves a row's group by title when import created duplicate group nodes.
- Grouping is a **display dimension only**. With `sequence` enabled, all rows in the scope share one intrinsic sequence; groups partition that sequence rather than defining their own.
- Rows with no group relation **must** appear in the synthetic `__unassigned__` group.

### `sequence` layer

- Rows **must** sort by the intrinsic edge `order` property (server-provided via member-page `intrinsicSequence`). Column header / view sorts are not offered for sequenced tables.
- Users **must** be able to drag a row within its group to change the sequence, and to a different group to change the group relation.
- Dropping onto the `__unassigned__` group **must** remove the group relation.
- Every move **must** rewrite sparse integer order values (`10, 20, 30, …`) across the submitted row id sequence via `rewriteDatabaseSequence` (per-row edge resolve; not a full-set preload).

### Editor UI

- A database section with `groups` **must** render as `GroupedDatabaseView`: tabs, then one table per group.
- Table columns **must** come from the type table schema and `views.json` column order, minus the composition's excluded keys.
- Relation columns **must** be hydrated from outgoing graph relationships, the same pipeline as flat database tables.
- Name cells **must** remain navigable links to node pages.
- Adding a row from a group footer **must** create the node with the scope relation (when a scope is active) and the group relation (unless the group is `__unassigned__`), and stamp `order` scoped to the active scope.
- Rows **must** load in windowed batches with infinite scroll (same `limit`/`offset`/`q` contract as other multi-row tables; see [views.md](./views.md) § Lazy-loaded rows). Groups flatten to a single row sequence for windowing; empty placeholder groups appear only when the full filtered set fits in one window.

### Static site

- The static export renders a grouped database section as one `DataTable` per group under a group heading. Extra tab pages carry `groups` in their tab payload.

### Import interaction

- Full re-import is **deprecated** for workflow: it would merge relationship properties and could overwrite adjusted `order` values.
- **Authoritative:** graph `order` from editor sequence edits and direct writes. Preserve `order` when mining export data into existing rows.

## Design rationale

### Composable layers over a bespoke section type

The original design shipped a dedicated `ordered-collection` node-page section with its own view detail, HTTP routes, and editor component — a parallel stack that duplicated the database table for one domain shape. Splitting the behavior into three independent layers on the existing database section means each capability (scope tabs, grouping, intrinsic sequence) can be adopted alone, and every table feature (columns, dynamic properties, relation cells, windowing) works without being reimplemented.

### Hidden automatic order

Legacy tooling required manual juggling of an Order column. The `sequence` layer pins the table to intrinsic edge order and uses drag-and-drop to edit that graph data without exposing implementation details as a column.

### Scope-wide order with group partitioning

For Marloth, scene order is meaningful per book. Parts organize narrative structure but do not define separate sequences — a scene's position in Part 3 still reflects its place in the book's overall timeline.

### Config in git-tracked JSON

Compositions live in `content/model/table-presentation.json` so the engine in `packages/tome-db/src/table-presentation/` stays domain-agnostic.

## Behavior / pipeline

View load:

```
GET /api/nodes/:databaseId?tab=:scopeId
  → getNodePageDetail
  → getDatabaseViewDetail → generated view → getCompositionById
  → buildComposedDatabaseView
  → database section with groups + presentation.sequenced
```

**SQL windowing (SQLite cache):** when the store has a query cache and `q` is empty, scope discovery, the unified **member-page read** (`listMemberPage`: scope filter, group assignment/`canonicalGroupByTitle`, view sorts or intrinsic sequence, relation display, `limit`/`offset`), and group headers (`listComposedGroupHeaders`) run in parameterized SQL. Plain Items and composed presentations share that member-page contract—composition only fills optional fields. Relation-column **display** is selected in the same page query (JSON link aggregates) via Analyze→Bind→Plan→Emit. With `q`, the same surfaces use scoped `TomeSearch.searchWindow` over member ids, then materialize only the hit page (including group ids and relation fields). Dyn **display** still hydrates only the returned window in TypeScript. Non-expressible or unresolved dyn sorts are refused (SQL window + intrinsic edge order + warning), not a full-materialize escape. Without a cache (flatfile), the full-materialize path remains (Imp related-id hops + `applyNameFilterAndWindow`). See [views.md](./views.md) § Lazy-loaded rows and [search.md](./search.md).

Sequence edit:

```
User drag-drop (webview)
  → PATCH /api/databases/:databaseId/sequence
  → rewriteDatabaseSequence (tome-db)
  → applySparseSequenceRewrite (findSetEdge per row) + optional group relation move
  → content write + SQLite cache sync
```

## Out of scope

- UI for registering new compositions
- Inline editing of non-order relationship scalars
- Per-group local order

## Verification

- `bun test packages/tome-flatfile/tests` — composition file parsing and loading
- `bun test packages/tome-db/tests` — composed view, groups, sequence mutations, Imp semantic related-id hops
- `bun test packages/tome-server/tests/api` — node page section and sequence endpoint
- `bun test packages/tome-editor/tests` — `GroupedDatabaseView` rendering, filtering, unlink
- Manual: open the Scenes database → scope tabs → drag within/across groups → reload → order persists

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `content/model/table-presentation.json` | Composition entries (layers, composites, column exclusions) |
| `packages/tome-graph-interfaces/src/table-presentation.ts` | Composition, group, and presentation DTOs |
| `packages/tome-flatfile/src/table-presentation/` | Parse / load / invalidate the composition file |
| `packages/tome-db/src/table-presentation/compose.ts` | Build the composed `DatabaseViewDetail` |
| `packages/tome-db/src/semantic-related-ids.ts` | Composite → table-schema token → Imp `executeImp` related ids |
| `packages/tome-db/src/table-presentation/relation-scope-tabs.ts` | Scope discovery and row filtering |
| `packages/tome-db/src/table-presentation/relation-groups.ts` | Group headers, row→group resolution, windowing |
| `packages/tome-db/src/table-presentation/rewrite-sequence.ts` | Sparse sequence rewrite + group change |
| `packages/tome-db/src/database-view.ts` | Routes generated views to the composition path |
| `packages/tome-http/src/handler.ts` | `PATCH /api/databases/:id/sequence` |
| `packages/tome-editor/src/webview/components/GroupedDatabaseView.tsx` | Tabs, group tables, sequence drag-and-drop |
| `packages/tome-static-site/src/components/DatabaseSection.astro` | Grouped static rendering |

## See also

- [views.md](./views.md)
- [sets.md](./sets.md)
- [tome-db.md](./tome-db.md)
- [tome-editor.md](./tome-editor.md)
- [`../ontology.md`](../ontology.md)
