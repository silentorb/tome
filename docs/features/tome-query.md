# tome-query

## Summary

**tome-query** is a page-block extension that lets authors build a **custom table** whose row pipeline is an Imp collection graph, edited in an Imp graph canvas and executed as SQL against all **live** Tome nodes (`nodes` where `is_archived = 0`).

Data flow: **Imp graph (+ layout) → tome-imp-sql → TomeQueryCache.queryAll**.

The Imp canvas embed (`TomeImpView`) lives in **`tome-imp-view`** (around **`imp-graph-view`**). This package owns query defaults, SQL execute, and the results-table embed.

## When to read this

- Authoring or changing the query page block
- Interactive page-block mounting (host mounts extension React)
- Host right tool panel (Imp graph editor outside Milkdown)
- Imp ↔ Tome SQL binding for live `nodes` and path hops (see [tome-imp-sql.md](./tome-imp-sql.md))

## Requirements

### Block storage

- Fence role: `type="query"` (component id `tome-query`, `roles: ["query"]`)
- Fence body: `{ version: 1, graph, layout }` — Imp graph is canonical; `layout` holds positions by node id
- Legacy fences may still contain `reactFlow: { nodes, edges }`; parse converts via `reactFlowToImpAndLayout` (see [compatibility.md](./compatibility.md) `page-block-reactflow-fence`)
- Default insert: Imp `input` → `output` (no transforms)
- Legacy fences may still contain `viewMode`; parse ignores it

### Editor UI

- Must register with `interactive: true` so tome-editor mounts the React `Component` in the document embed
- **Document embed:** always the results table (Refresh + **Edit query**); the table grows with its rows and scrolls with the page shell (no inner `max-height` scroll box)
- **Edit query** opens the host right tool panel with `TomeImpView`; the panel is hidden when closed
- The host tool panel is user-resizable (drag the left edge; width persists in localStorage)
- Closing the panel re-runs the table query; Refresh re-runs while the panel is closed
- Graph / layout edits update fence `data` via `onBlockDataChange`
- Table invokes `POST /api/extensions/tome-query/invoke` with `{ action: "execute", data, parameters? }`
- When the Imp graph declares **`parameter` nodes**, a settings gear appears; values persist in user settings (`blockParameters`) and are sent as `parameters` on invoke
- Table errors are shown in a readonly field so they can be selected/copied inside the Milkdown embed
- No page-node / type-table scope in v1 — `nodeId` is ignored for the collection source **except** as the `"page"` target of a `corpus` operator
- Wiring a new edge onto an occupied input port replaces the previous inbound edge; output ports may fan out
- Literal text fields on operator ports appear only for scalar ports (`string` / `number` / `any`) that have **no** inbound edge; `collection` and `boolean` ports never show text inputs
- Selected nodes/edges are removable with **Backspace** or **Delete** (disabled when the block is read-only)
- Legacy graphs with multiple inbound edges to one port keep the last edge and drop the rest (parse + compile); they do not fail to load. Fence data is not rewritten on mount.

### Query semantics

- Input = unresolved enumeration of all live nodes (IEnumerable-style pipeline; corpus rows are not canvas nodes)
- **`corpus` operator (Tome-only, pre-SQL):** pin the input collection to one corpus before Imp SQL lowering. Port `id` is `"page"` (default: corpus that owns the page node), a corpus slug (`translucence`, `marloth`), or `"all"` (session union). On composed hosts the session SQLite `nodes.corpus_id` column scopes live `FROM nodes` (`AND corpus_id = '…'`). Flatfile-only hosts may still materialize an `id IN (…)` set from the store routing map. `imp-sql` never sees this node type.
- Supported transforms: Imp collection library (`filter`, `except`, `sort`, `limit`, `offset`, `project`, `group`, predicates, `column`, `literal`)
- Supported path ops: Imp `traverse` (single hop via `relationship_projections`; Imp inputs are separate bare `association` (relationship type ULID; Imp field name) + `direction` — Tome packs them to projection types only at SQL/execute time). Author those ports as ordinary Imp literals on the canvas; there is no relation-picker sugar.
- Multi-hop = chain `traverse` nodes
- `except` is declarative set difference by `id`; SQL lowering uses `NOT EXISTS` over the exclude subquery (not an in-memory subtract)
- Columns: Imp `project` with comma-separated logical names; `id` / `is_archived` / promoted node fields (`title`, `alias`, `body`, `created_at`, `modified_at`) are table columns; other names map to `node_properties` EAV subqueries. Edge filters on traverse use promoted relationship columns (`ordinal`, `order`, `priority`) or `relationship_projection_properties` EAV (see [tome-imp-sql.md](./tome-imp-sql.md)).
- **Title-link baseline:** every result table always shows a first **title** column of node page links (like database table name cells). Compile always ensures SQL selects `id` and `title` (merging into any author `project`, or adding `title` on bare `SELECT *`). Visible columns omit raw `id` / duplicate `title` plumbing; author-projected extras follow the title column. Projecting only `id` yields a single-column title-link table.
- Host must exclude archived nodes even when the graph has no filter (including traverse targets)

### Host services

- Extensions receive `services.executeImp` (`executeImp(graph, context?)` → `{ columns, rows }`) for Imp collection queries
- Extensions receive `services.corpusQuery` (`corpusIdForNode`, `nodeIdsInCorpus`) backed by session SQLite `nodes.corpus_id` when a query cache is present (flatfile routing map otherwise)
- Editor page-block context may expose `openToolPanel` / `closeToolPanel` for the host right panel

## Design rationale

- Imp already models collection → collection with boundary `input` / `output`; `tome-imp-sql` supplies the Tome `RelationalSchema` (nodes + projections)
- Storing Imp graph + separate layout preserves topology and positions without treating React Flow as the document format
- Interactive page blocks are a general host capability; tome-query is the first consumer
- The graph editor lives in the host tool panel, not inside Milkdown

## Behavior / pipeline

1. Author inserts **Query table** from the slash menu
2. Document shows the result table (auto-run on mount)
3. **Edit query** opens the right panel; author edits Imp operators; changes update fence `data` (`graph` / `layout`)
4. Panel close (or Refresh) re-runs: server compiles Imp → `executeImp`, returns `{ columns, rows }`
5. Static / prepare-editor HTML renders the same snapshot when `executeImp` is available

## Out of scope (v1)

- Page node as optional Imp input
- Type-table membership as Input
- Relation-picker / path-hop dropdown chrome on the canvas (pathing remains an Imp+Tome bind concern, not UI sugar)
