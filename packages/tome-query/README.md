# tome-query

Imp-backed custom table page block: React Flow query editor → Imp graph → SQL over live Tome nodes.

## Feature spec

[`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Block data + default input→output graph |
| `src/schema.ts` | `nodes` RelationalSchema + live-node SQL rewrite |
| `src/execute.ts` | RF → Imp → SQL compile |
| `src/render.ts` | Execute + HTML table |
| `src/editor.tsx` | Interactive React UI (table / query modes) |
| `src/query-editor.tsx` | React Flow canvas |
| `src/html.ts` / `server.ts` | Subsystem registrations |

## Dependencies

- `tome-interfaces` only among Tome packages
- Imp packages via workspace link (`tome` root workspaces include `../imp/packages/*` in the workbench)
- `@xyflow/react` for the query canvas

## Run / test

```bash
bun test   # from this package
```
