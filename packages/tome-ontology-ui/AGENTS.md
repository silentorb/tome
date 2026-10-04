# tome-ontology-ui — agent notes

**Feature spec:** [`docs/features/ontology.md`](../../docs/features/ontology.md)

Client-side ontology viewing/editing. First surface: interactive `node-filter` page blocks (Imp node→boolean graphs on predicate nodes).

## Boundary vs `tome-ontology`

| Package | Owns |
| --- | --- |
| `tome-ontology` | Store-independent runtime (predicates, patterns). Keep deps minimal. Optional for minimal Tome. |
| `tome-ontology-ui` | Editor/HTML/server page-block modules and any future ontology UI |

Never add React / React Flow deps to `tome-ontology`. This package depends on `tome-ontology` (types/vocabulary); never the reverse.

## Storage

Fence body is **raw Imp** `{ nodes, edges }` (property `{#predicate type="node-filter"}`). React Flow is editor-only via `impToReactFlow` / `reactFlowToImp`.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse/default Imp filter; Imp↔RF adapters |
| `src/editor.tsx` | Interactive block + tool panel (`ImpFlowEditor`) |
| `src/html.ts` / `server.ts` | Static summary / thin register |

## Tests

```bash
bun test   # from this package, or: bun run --filter tome-ontology-ui test
```
