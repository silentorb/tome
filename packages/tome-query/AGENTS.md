# tome-query — agent notes

**Feature spec:** [`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Dependencies

Only `tome-interfaces` among Tome packages. Imp packages resolve via tome root workspaces (`../imp/packages/*`). Do not import `tome-db` / `tome-editor` / `tome-static-site`.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse/default block `data` (React Flow graph is canonical) |
| `src/schema.ts` | Live `nodes` schema + `is_archived` rewrite |
| `src/execute.ts` | Compile RF → Imp → SQL |
| `src/editor.tsx` | `interactive: true` page block; Table / Query mode toggle |
| `src/html.ts` / `server.ts` | Snapshot table / invoke execute |

## Agent constraints

- Query Input is **all live nodes** — ignore page `nodeId` for the collection source (v1).
- React Flow shows Imp operators only — never materialize corpus rows as RF nodes.
- Column selection uses Imp `project`; property columns map via `json_extract`.
