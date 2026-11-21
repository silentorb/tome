# tome-query — agent notes

**Feature spec:** [`docs/features/tome-query.md`](../../docs/features/tome-query.md)

## Dependencies

Among Tome packages: `tome-interfaces` + `tome-imp-sql` (schema/registry/compile binder) + `tome-imp-view` (thin Tome embed around `imp-graph-view`). Imp packages resolve via tome root workspaces (`../imp-ts/packages/*`, `../imp-graph-view`). Do not import `tome-db` / `tome-editor` / `tome-static-site`.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse/default block `data` (Imp `graph` + `layout`; dual-read legacy `reactFlow`) |
| `src/execute.ts` | Compile Imp → SQL via `tome-imp-sql` |
| `src/editor.tsx` | `interactive: true` page block; in-doc table + Edit query → host tool panel (`TomeImpView`) |
| `src/html.ts` / `server.ts` | Snapshot table / invoke execute |

## Agent constraints

- Query Input is **all live nodes** — ignore page `nodeId` for the collection source (v1), except as `"page"` for a Tome `corpus` operator (pre-SQL).
- Canvas shows Imp operators only — never materialize corpus rows as graph nodes. Canvas UI is `tome-imp-view` → `imp-graph-view`.
- Column selection uses Imp `project`; property columns map via `json_extract`.
- Terminal Imp `group` nodes partition result rows; `partitionRowsIntoGroups` sorts enum keys by schema `values` when present.
- Result tables always lead with a title-link column; compile ensures `id` + `title` plumbing (`ensureIdentityTitleProjection` / `ensureTitleColumnInSelectStar`).
- Port literal inputs: only scalar ports without an inbound edge (handled in `imp-graph-view`).
- Path hops use Imp `traverse` with `association` + `direction`; `tome-imp-sql` maps those to projection types at SQL bind time. Pathing is not canvas UI sugar — edit ports as ordinary Imp literals.
- Imp `parameter` nodes are discovered for settings UI; values persist in user settings and bind at execute via `bindGraphParameters` (not stored in fence `data`).

## Tests

```bash
bun test   # from packages/tome-query, or: bun run --filter tome-query test
```

Runs `tsc --noEmit`, then `bun test` with `--preload ./tests/test-setup.ts` (happy-dom via `@happy-dom/global-registrator`). UI tests use `@testing-library/react`. Unit tests: `tests/execute.test.ts`. UI tests: `tests/editor.test.tsx`.
