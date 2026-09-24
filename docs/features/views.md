# Table views (`views.json`)

## Summary

Table view configuration for type-table member relationships lives in [`content/model/views.json`](../../content/model/views.json). It defines how rows are sorted and presented without changing graph data in node markdown files.

## View records (v2)

```json
{
  "version": 2,
  "views": [
    {
      "id": "weighted",
      "nodeId": "2eea538996934ce8abafc27132e576c1",
      "association": "01KXBNPNJDENZ9BXN5BYZ7JKPT",
      "name": "Weighted",
      "sorts": [{ "column": "weighted_use", "direction": "desc" }],
      "properties": ["type", "features", "weighted_use"]
    },
    {
      "nodeId": "204dba198db74611b0b49a98dd53e8f5",
      "association": "01KXBNPNJDENZ9BXN5BYZ7JKPT",
      "presentation": {
        "scope": { "memberToScopeComposite": "01KXBNPNJDENZ9BXN5BYZ7JKQD" },
        "groups": {
          "memberToGroupComposite": "01KXBNPNJDENZ9BXN5BYZ7JKQB",
          "groupTypeDatabaseId": "01KWN86X6NJZMP5ZESZTNDXXZQ",
          "unassignedGroupTitle": "Unassigned"
        },
        "sequence": {}
      },
      "properties": ["parents", "children", "scenes"]
    }
  ]
}
```

- **`association`**: set-trait association ULID from `associations.json` (not a display label).
- **Custom views**: require `id`, `name`, `sorts` (array, may be empty).
- **Generated (composed) views**: require `presentation` with at least one of `scope` / `groups` / `sequence`; tabs are computed at runtime (e.g. one per scope node). See [table-presentation.md](./table-presentation.md).
- **`properties`**: optional string array of visible column keys in display order (additive allowlist).
  - Absent → all columns visible, default order.
  - Present → only listed keys are visible, in listed order (unknown keys ignored; missing keys are not appended).
  - **Custom views:** per-view (not synced across sibling tabs). Reorder, visibility toggles, and UI column-add update the active view only.
  - **Generated views:** shared on the single generated record for all tabs produced by that composition.
- **Tab order**: array order of views sharing the same pair; the UI derives tabs when more than one view exists.

## Editor behavior

- Active tab is selected via `?tab=` (standalone) or node GET `?tab=` when present; otherwise the editor restores the last tab from `.marloth/user-settings.json` (`tableTabs`).
- Custom views support in-editor CRUD via `/api/views/nodes/:id/associations/:associationId/views`.
- View order is updated via `PATCH /api/views/nodes/:id/associations/:associationId` with `{ viewOrder: string[] }`.
- Column order and visibility for a custom view are updated via `PATCH .../views/:viewId` with `{ properties: string[] }`.
- Shared properties for a generated association are updated via `PATCH .../associations/:associationId` with `{ properties: string[] }`.
- Adding a stored column via the UI passes `viewId` so the new key is appended only to the active custom view’s `properties` (when that allowlist already exists). Sibling custom views are unchanged.
- Generated views (Scenes) switch scope only; no CRUD chrome. Grouped rows and drag-and-drop for a generated view come from its `presentation` layers — see [table-presentation.md](./table-presentation.md).

## Lazy-loaded rows (infinite scroll)

Multi-row Items tables **must not** block page load on the full member set. The editor requests rows in batches (default **`limit=50`**) with **`offset`**, optional name filter **`q`**, and optional **`sorts`** JSON. There is **no paging UI** (no page numbers): the client appends the next batch when the user scrolls the **page shell** (`.tome-main`) near the table sentinel—not an inner table scroll box. Tables size to their loaded rows (natural page height).

- Responses include `rowsWindow: { offset, limit, total, hasMore }` on `DatabaseViewDetail` and `RelationTableSection`.
- Endpoints: `GET /api/databases/:id`, `GET /api/nodes/:id/relation-tables/:perspective`, and the multi-row sections embedded in `GET /api/nodes/:id` (editor default limit). Omit `limit` for a full result (static site export).

### SQLite path: filter / sort / window in SQL

When the editor is backed by the **SQLite query cache**, filter, sort, join, and group for table windows **must** run in SQL (typically via Imp → Imp SQL / tome-imp-sql, or equivalent parameterized SQL on the cache). Application TypeScript may only **hydrate** DTOs from already-ordered, already-windowed SQL rows — O(window), not O(graph). Section metadata such as `typeNodeId` must come from association/schema config (`endpoints` / relation columns), not from full-graph title scans. See [tome-imp-sql.md](./tome-imp-sql.md) § Collection ops (SQL path).

**Flatfile** backends are exempt and may still use in-memory collection ops.

**Binary routing (no hybrids):** when table `q` is set, use the **scoped searcher window** path (not view sorts + SQL limit, and not JS substring relevance). When `q` is empty, use the **SQL window** path. Never SQL-`LIMIT` then sort/filter in JS. Flatfile remains exempt (in-memory `applyNameFilterAndWindow`).

| Backend | Non-expressible / unresolved dyn sort |
| --- | --- |
| SQLite + cache | **Fail-closed:** refuse that sort (warning), keep the SQL window, default membership/`ORDER BY` title·id (or ordered edge order when applicable) |
| Flatfile / no cache | Exempt: full membership + JS sort/window |

Unsafe schema column keys and relation columns missing `relationType` are stripped at column-def build (warning), not used as a silent full-materialize escape. Relation-section bind already ignores unknown sort keys safely.

**Table `q` (lifted):** editor table name filter goes through the active [`TomeSearch`](./search.md) via `searchWindow` scoped with `allowedNodeIds` (set members / related nodes / composed scope). Ranking and pagination (`total` / `offset` / `limit`) come from the searcher (FTS or LIKE). Dyn and relation **display** still hydrate only the returned window. No searcher → empty window (`total: 0`), matching global search unavailability.

**Dyn sorts** (fixed keys such as `weighted_use` / `wonder` / `all_scene_count`, and column-set keys such as `scene_count__*`): content-addressed **expression indexes** in the SQLite cache (lazy-built from a DynAggregate IR on miss; column-set digests bind `dimensionId`). Items windows `ORDER BY` the indexed values; display still hydrates dyn cells on the returned window only. See [dynamic-properties.md](./dynamic-properties.md) § Expression indexes and [expression-indexes.md](./expression-indexes.md).

**Coverage today:** relation table sections, **Items / database custom views**, and **composed / generated presentations** use one **member-page read** (`listMemberPage`) when `q` is empty; with `q`, they use scoped searcher windows (flatfile remains on the legacy name-filter path). Composition layers only fill optional request fields (scope, groups, sorts); plain Items and composed share the same cache contract.

**Member-page SQL compiler (SQLite):** membership windows compile through **Analyze → Bind → Plan → Emit** in `tome-sqlite` (`membership-query/`). Analyze gathers the full problem Intent; Bind lowers sort keys and relation display fields into a shared expression catalog; Plan chooses layered relational structure; Emit renders parameterized SQL. Relation-column **display** is a bound field on that page query (correlated JSON aggregates), not a post-window TypeScript edge/`getNode` walk. Flatfile still hydrates relation cells in TypeScript after the window. Dyn **display** cells remain window-hydrated in TypeScript. Table search ranking stays outside this compiler except an optional member-id restrict on the same read.

## Migration

Legacy v1 nested format was migrated with:

```bash
bun scripts/migrate-views-json-v2.ts
```

## Code

| Area | Path |
| --- | --- |
| File format | `packages/tome-db/src/content/views-file.ts` |
| Index / lookup | `packages/tome-db/src/views/index.ts` |
| Resolution | `packages/tome-db/src/views/resolve-tabs.ts` |
| Mutations | `packages/tome-db/src/views/mutations.ts` |
| UI | `packages/tome-editor/src/webview/components/TableUtilityBar.tsx` |
