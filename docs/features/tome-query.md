# tome-query

## Summary

**tome-query** is a page-block extension that lets authors build a **custom table** whose row pipeline is an Imp collection graph, edited in React Flow and executed as SQL against all **live** Tome nodes (`nodes` where `is_archived = 0`).

Data flow: **React Flow → Imp graph → tome-imp-sql → TomeQueryCache.queryAll**.

## When to read this

- Authoring or changing the query page block
- Interactive page-block mounting (host mounts extension React)
- Host right tool panel (React Flow editor outside Milkdown)
- Imp ↔ Tome SQL binding for live `nodes` and path hops (see [tome-imp-sql.md](./tome-imp-sql.md))

## Requirements

### Block storage

- Fence component id: `tome-query.block`
- Block `data`: `{ version: 1, reactFlow: { nodes, edges } }` — React Flow is canonical so layout survives save
- Default insert: Imp `input` → `output` (no transforms)
- Legacy fences may still contain `viewMode`; parse ignores it

### Editor UI

- Must register with `interactive: true` so tome-editor mounts the React `Component` in the document embed
- **Document embed:** always the results table (Refresh + **Edit query**)
- **Edit query** opens the host right tool panel with React Flow; the panel is hidden when closed
- The host tool panel is user-resizable (drag the left edge; width persists in localStorage)
- Closing the panel re-runs the table query; Refresh re-runs while the panel is closed
- Graph edits update fence `data` via `onBlockDataChange`
- Table invokes `POST /api/extensions/tome-query.block/invoke` with `{ action: "execute", data }`
- Table errors are shown in a readonly field so they can be selected/copied inside the Milkdown embed
- No page-node / type-table scope in v1 — `nodeId` is ignored for the collection source
- Wiring a new edge onto an occupied input port replaces the previous inbound edge; output ports may fan out
- Literal text fields on operator ports appear only for scalar ports (`string` / `number` / `any`) that have **no** inbound edge; `collection` and `boolean` ports never show text inputs
- Selected nodes/edges are removable with **Backspace** or **Delete** (disabled when the block is read-only)
- Legacy graphs with multiple inbound edges to one port keep the last edge and drop the rest (parse + compile); they do not fail to load. Fence data is not rewritten on mount.

### Query semantics

- Input = unresolved enumeration of all live nodes (IEnumerable-style pipeline; corpus rows are not RF nodes)
- Supported transforms: Imp collection library (`filter`, `except`, `sort`, `limit`, `offset`, `project`, predicates, `column`, `literal`)
- Supported path ops: Imp `traverse` (single hop via `relationship_projections`; `edgeType` is a projection type string)
- `except` is declarative set difference by `id`; SQL lowering uses `NOT EXISTS` over the exclude subquery (not an in-memory subtract)
- Columns: Imp `project` with comma-separated logical names; `id` / `is_archived` are table columns; other names map to `json_extract(properties, '$.name')`
- **Title-link baseline:** every result table always shows a first **title** column of node page links (like database table name cells). Compile always ensures SQL selects `id` and `title` (merging into any author `project`, or adding `json_extract(…) AS title` on bare `SELECT *`). Visible columns omit raw `id` / duplicate `title` plumbing; author-projected extras follow the title column. Projecting only `id` yields a single-column title-link table.
- Host must exclude archived nodes even when the graph has no filter (including traverse targets)

### Host services

- Extensions receive `services.sqlQuery.queryAll(sql, params)` (parameterized SQL from Imp compile only)
- Editor page-block context may expose `openToolPanel` / `closeToolPanel` for the host right panel

## Design rationale

- Imp already models collection → collection with boundary `input` / `output`; `tome-imp-sql` supplies the Tome `RelationalSchema` (nodes + projections)
- Storing React Flow (not Imp alone) preserves node positions
- Interactive page blocks are a general host capability; tome-query is the first consumer
- React Flow is too complex for ProseMirror node views — the graph editor lives in the host tool panel, not inside Milkdown

## Behavior / pipeline

1. Author inserts **Query table** from the slash menu
2. Document shows the result table (auto-run on mount)
3. **Edit query** opens the right panel; author edits Imp operators in React Flow; changes update fence `data`
4. Panel close (or Refresh) re-runs: server converts RF → Imp → SQL, wraps `FROM nodes` with live-only subquery, runs `queryAll`, returns `{ columns, rows }`
5. Static / prepare-editor HTML renders the same snapshot when `sqlQuery` is available

## Out of scope (v1)

- Page node as optional Imp input
- Type-table membership as Input
- Variable-length / recursive path CTEs (chain `traverse` nodes instead)
- Replacing `views.json` database tabs
- Editable result rows

## Verification

- Unit: `packages/tome-query/tests/execute.test.ts` — config parse, schema rewrite, compile/execute
- UI: `packages/tome-query/tests/editor.test.tsx` — Edit query → `openToolPanel`, invoke/Refresh, errors (happy-dom + `@testing-library/react`; `QueryFlowEditor` mocked)
- Functional: `packages/tome-functional-tests/tests/query-block-data-roundtrip.test.tsx` — UI → normalize → `saveBody` → `prepare-editor-body` → remount (in-process API)
- Host hop: `packages/tome-editor/tests/webview/page-block-data-persist.test.tsx` — block data change → `getMarkdown` / `markdownUpdated`
- Autosave baseline: `packages/tome-editor/tests/webview/editor-markdown-update.test.ts` — first edit after create is saved (not treated as load baseline)
- Tool panel: `packages/tome-editor/tests/webview/components/ToolPanel.test.tsx`
- Tool panel width prefs: `packages/tome-editor/tests/webview/tool-panel-preferences.test.ts`

```bash
bun run --filter tome-query test
bun run test:functional
```

## See also

- [tome-imp-sql.md](./tome-imp-sql.md) — Imp → Tome SQL binder
- [extensions.md](./extensions.md) — registration + interactive mounting
- [page-blocks.md](../extensions/page-blocks.md)
- Imp [sql.md](../../../imp/docs/features/sql.md) / [collection-transforms.md](../../../imp/docs/features/collection-transforms.md) / [pathing.md](../../../imp/docs/features/pathing.md)
