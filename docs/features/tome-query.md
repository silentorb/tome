# tome-query

## Summary

**tome-query** is a page-block extension that lets authors build a **custom table** whose row pipeline is an Imp collection graph, edited in React Flow and executed as SQL against all **live** Tome nodes (`nodes` where `is_archived = 0`).

Data flow: **React Flow → Imp graph → imp-sql → TomeQueryCache.queryAll**.

## When to read this

- Authoring or changing the query page block
- Interactive page-block mounting (host mounts extension React)
- Imp ↔ Tome SQL binding for the `nodes` table

## Requirements

### Block storage

- Fence component id: `tome-query.block`
- Block `data`: `{ version: 1, reactFlow: { nodes, edges } }` — React Flow is canonical so layout survives save
- Default insert: Imp `input` → `output` (no transforms)

### Editor UI

- Must register with `interactive: true` so tome-editor mounts the React `Component`
- Mode toggle: **Table** (results) | **Query** (React Flow)
- Table mode invokes `POST /api/extensions/tome-query.block/invoke` with `{ action: "execute", data }`
- No page-node / type-table scope in v1 — `nodeId` is ignored for the collection source
- Wiring a new edge onto an occupied input port replaces the previous inbound edge; output ports may fan out
- Legacy graphs with multiple inbound edges to one port keep the last edge and drop the rest (parse + compile); they do not fail to load. Fence data is not rewritten on mount.

### Query semantics

- Input = unresolved enumeration of all live nodes (IEnumerable-style pipeline; corpus rows are not RF nodes)
- Supported transforms: Imp collection library (`filter`, `sort`, `limit`, `offset`, `project`, predicates, `column`, `literal`)
- Columns: Imp `project` with comma-separated logical names; `id` / `is_archived` are table columns; other names map to `json_extract(properties, '$.name')`
- Host must exclude archived nodes even when the graph has no filter

### Host services

- Extensions receive `services.sqlQuery.queryAll(sql, params)` (parameterized SQL from Imp compile only)

## Design rationale

- Imp already models collection → collection with boundary `input` / `output`; Tome supplies `RelationalSchema` for `nodes`
- Storing React Flow (not Imp alone) preserves node positions
- Interactive page blocks are a general host capability; tome-query is the first consumer

## Behavior / pipeline

1. Author inserts **Query table** from the slash menu
2. Query mode: edit Imp operators in React Flow; changes update fence `data`
3. Table mode: server converts RF → Imp → SQL, wraps `FROM nodes` with live-only subquery, runs `queryAll`, returns `{ columns, rows }`
4. Static / prepare-editor HTML renders the same snapshot when `sqlQuery` is available

## Out of scope (v1)

- Page node as optional Imp input
- Joins / relationship traversals / type-table membership as Input
- Replacing `views.json` database tabs
- Editable result rows

## Verification

- Unit: `packages/tome-query/tests/execute.test.ts` — config parse, schema rewrite, compile/execute
- UI: `packages/tome-query/tests/editor.test.tsx` — Table/Query toggle, invoke/Refresh, errors (happy-dom + `@testing-library/react`; `QueryFlowEditor` mocked)

```bash
bun run --filter tome-query test
```

## See also

- [extensions.md](./extensions.md) — registration + interactive mounting
- [page-blocks.md](../extensions/page-blocks.md)
- Imp [sql.md](../../../imp/docs/features/sql.md) / [collection-transforms.md](../../../imp/docs/features/collection-transforms.md)
