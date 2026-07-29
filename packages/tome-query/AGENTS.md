# tome-query — agent notes

**Feature spec:** [`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Dependencies

Only `tome-interfaces` among Tome packages. Imp packages resolve via tome root workspaces (`../imp/packages/*`). Do not import `tome-db` / `tome-editor` / `tome-static-site`.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse/default block `data` (React Flow graph) |
| `src/schema.ts` | Live `nodes` schema + `is_archived` rewrite |
| `src/execute.ts` | Compile RF → Imp → SQL |
| `src/editor.tsx` | `interactive: true` page block; in-doc table + Edit query → host tool panel |
| `src/html.ts` / `server.ts` | Snapshot table / invoke execute |

## Agent constraints

- Query Input is **all live nodes** — ignore page `nodeId` for the collection source (v1).
- React Flow shows Imp operators only — never materialize corpus rows as RF nodes.
- Column selection uses Imp `project`; property columns map via `json_extract`.

## Tests

```bash
bun test   # from packages/tome-query, or: bun run --filter tome-query test
```

Runs `tsc --noEmit`, then `bun test` with `--preload ./tests/test-setup.ts` (happy-dom via `@happy-dom/global-registrator`). UI tests use `@testing-library/react`. Unit tests: `tests/execute.test.ts`. UI tests: `tests/editor.test.tsx` (mocks `QueryFlowEditor`).
