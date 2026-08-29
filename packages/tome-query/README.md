# tome-query

Imp-backed custom table page block: React Flow query editor → Imp graph → SQL over live Tome nodes.

## Feature spec

[`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Block data + default input→output graph |
| `src/execute.ts` | RF → Imp → SQL compile via `tome-imp-sql` |
| `src/render.ts` | Execute + HTML table |
| `src/editor.tsx` | Interactive React UI (table / query modes) |
| `src/query-editor.tsx` | React Flow canvas |
| `src/html.ts` / `server.ts` | Subsystem registrations |

## Dependencies

- `tome-interfaces` + `tome-imp-sql` among Tome packages
- Imp packages via workspace link (`tome` root workspaces include `../imp-ts/packages/*` in the workbench)
- `@xyflow/react` for the query canvas

## Run / test

```bash
bun test   # from this package
```
