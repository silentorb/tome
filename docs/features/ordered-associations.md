# Ordered associations

## Summary

**Ordered associations** are graph relationships whose sequence matters. The workspace manages order automatically through dedicated UI—users never edit an `order` field directly. The first configured instance is **Scenes** on the Scenes database node page: scenes are ordered within each book (Product), grouped by Part for display, and reordered via drag-and-drop.

## When to read this

Read this doc when your task involves:

- Scene ordering within a book
- Drag-and-drop reordering of graph associations
- The `order` relationship property on `IS_A` membership relationships
- Extending ordered-association configuration to new node types

For graph storage basics, read [tome-db.md](./tome-db.md). For the editor UI, read [tome-editor.md](./tome-editor.md). For domain semantics (Scene, Part, Product), read [`../ontology.md`](../ontology.md).

## Requirements

### Core model

- Ordered associations **must** store sequence in a designated relationship property (`order` by default) on the membership relationship (e.g. `(scene)-[:IS_A {order}]->(Scenes database)`).
- The `order` property **must** be treated as import/metadata: hidden from all table columns and never exposed as an editable field in the UI.
- Order **must** be scoped: for scenes, order applies within a **book** (Product), not globally across all scenes in the database.
- **Grouping** (Part) is a display dimension only; all scenes in a book share one global sequence. Part subsections sort scenes by that book-wide order.
- Part subsections **must** sort by the Parts database `number` property (with **Unassigned** always last), not by table row index.
- Part membership **must** resolve when import created duplicate part nodes: match scene→`part` to the canonical Parts-database row by title.
- Configurations **must** be defined in [`content/model/ordered-associations.json`](../../content/model/ordered-associations.json); v1 has no UI for adding new configs.

### Scenes configuration (`scenes-by-book`)

| Setting | Value |
| --- | --- |
| Type database | Scenes NotionDatabase (`204dba198db74611b0b49a98dd53e8f5`) |
| Membership relationship | `is_a` with `order` property |
| Scope (book tabs) | `product` relationship from scene → Product |
| Group (part subsections) | `part` relationship from scene → Part |
| Part subsection order | Parts database `number` property on each Part's `is_a` membership (Unassigned always last) |
| Unassigned | Scenes with a Product but no Part appear in an **Unassigned** group at the end |

### Editor UI (Scenes Items section)

- The Scenes database **Items** section **must** replace the flat database table with an ordered-association view.
- Book tabs **must** appear at the start of the section; each tab filters to one Product that has scenes.
- Each Part **must** have its own subsection with a table of scenes in that part.
- Tables **must** be sorted only by `order` (server-provided); column header sorting **must not** be available.
- Table columns **must** come from the Scenes database `notion_schema`, using the configured reference view (`TWOLD Active`) for visibility. Product, Part, Order, and Status **must** be excluded from columns because scope tabs, part groups, or drag-and-drop ordering replace them.
- Relation columns **must** be hydrated from outgoing graph relationships (same pipeline as standard database table views), not inferred only from `IS_A` edge properties.
- Users **must** be able to drag scenes within a part to reorder (book-wide sequence).
- Users **must** be able to drag scenes to a different part to change the `PART` association.
- Name cells **must** remain navigable links to scene node pages.

### Mutations

- Reorder and part-change operations **must** update the graph via the editor REST API.
- Only scenes whose `PRODUCT` relationship matches the active book scope **may** be mutated.
- On any move, the system **must** reassign sparse integer order values (`10, 20, 30, …`) to all scenes in the active scope.

### Import interaction

- Full Notion re-import is **deprecated** for workflow (see [notion-import.md](./notion-import.md)). It would merge relationship properties and **could overwrite** manually adjusted `order` values from CSV.
- **Authoritative:** graph `order` from ordered-association edits and direct DB updates. Preserve `order` when mining export data into existing rows.

## Design rationale

### Hidden automatic order

Notion required manual juggling of an Order column. Ordered associations move sequencing into first-class tooling: drag-and-drop reflects author intent without exposing implementation details.

### Book-scoped order with Part grouping

Scene order is meaningful per book (Product). Parts organize the narrative structure but do not define separate sequences—a scene's position in Part 3 still reflects its place in the book's overall timeline.

### Code registry over generic UI

Scenes are the only known use case. Config lives in git-tracked JSON; the engine in `packages/tome-db/src/ordered-associations.ts` stays domain-agnostic. See [session 03](../refactoring/03-ordered-associations-json.md) for the file schema.

## Behavior / pipeline

```
User drag-drop (webview)
  → PATCH /api/ordered-associations/scenes-by-book/move
  → applyOrderedAssociationMove (tome-db)
  → upsert is_a {order} + part relationship
  → SQLite data/marloth.sqlite
```

View load:

```
GET /api/nodes/:scenesDbId?scope=:productId
  → getNodePageDetail
  → getOrderedAssociationView
  → ordered-association section (book tabs + part groups)
```

## Out of scope (v1)

- UI for registering new ordered-association configs
- Creating scenes or parts from the editor
- Inline editing of non-order relationship scalars
- Per-part local order

## Verification

- `bun test packages/tome-db/tests` — ordered-association query and move tests
- `bun test packages/tome-editor/tests` — API and UI tests
- Manual: open Scenes database → book tabs → drag within/across parts → reload → order persists

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `content/model/ordered-associations.json` | Ordered-association config entries (provider ids, composites, column rules) |
| `packages/tome-db/src/ordered-associations-config/` | Parse/load/invalidate config file |
| `packages/tome-db/src/ordered-associations.ts` | View query, move mutation, schema-driven column defs |
| `packages/tome-db/src/database-column-defs.ts` | Shared column-def builder used by database and ordered-association views |
| `packages/tome-db/src/node-page-sections.ts` | Emits `ordered-association` section for configured databases |
| `packages/tome-editor/src/api/server.ts` | PATCH move endpoint, `scope` query param |
| `packages/tome-editor/src/webview/components/OrderedAssociationView.tsx` | Book tabs + DnD part tables |

## See also

- [tome-db.md](./tome-db.md)
- [tome-editor.md](./tome-editor.md)
- [`../ontology.md`](../ontology.md)
