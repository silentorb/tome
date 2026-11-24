# tome-imp-view

Thin Tome embedding adapter around [`imp-graph-view`](../../../imp-graph-view): tool-panel chrome (theme, add-node picker types), `createRegistry` → `resolvePorts`, and Imp Graph + layout bridging for page blocks.

General Imp canvas / converters / Precise editing live in `imp-graph-view`. Imp+Tome pathing is a separate layer — not this package.

## Layout

| Path | Role |
| --- | --- |
| `src/editor.tsx` | `TomeImpView` |
| `src/resolve-ports.ts` | Registry → `resolvePorts`, add-node picker types |
| `src/layout.ts` | Layout helpers + legacy React Flow envelope parse |
| `src/styles.css` | Tome theme overlay |

## See also

- `.mnt/imp-graph-view/AGENTS.md`
- `docs/features/tome-query.md`
