# tome-query

Imp-backed custom table page block: Imp graph editor → SQL over live Tome nodes.

## Feature spec

[`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Block data + default input→output graph |
| `src/execute.ts` | Imp → SQL compile via `tome-imp-sql` |
| `src/render.ts` | Execute + HTML table |
| `src/editor.tsx` | Interactive React UI (table + Edit query → tool panel) |
| `src/html.ts` / `server.ts` | Subsystem registrations |

The Imp canvas embed lives in [`tome-imp-view`](../tome-imp-view/) (around [`imp-graph-view`](../../../imp-graph-view/)).

## Dependencies

- `tome-interfaces` + `tome-imp-sql` + `tome-imp-view` among Tome packages
- Imp packages via workspace link (`tome` root workspaces include `../imp-ts/packages/*` and `../imp-graph-view`)

## Run / test

```bash
bun test   # from this package
```
