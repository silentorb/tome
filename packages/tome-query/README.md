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
| `src/editor.tsx` | Interactive React UI (table + Edit query → tool panel) |
| `src/html.ts` / `server.ts` | Subsystem registrations |

The Imp React Flow canvas lives in [`tome-react-flow`](../tome-react-flow/).

## Dependencies

- `tome-interfaces` + `tome-imp-sql` + `tome-react-flow` among Tome packages
- Imp packages via workspace link (`tome` root workspaces include `../imp-ts/packages/*` in the workbench)

## Run / test

```bash
bun test   # from this package
```
