# tome-react-flow — agent notes

Shared Imp graph canvas on React Flow (`@xyflow/react`). Used by `tome-query`, `tome-sequencing`, and `tome-ontology-ui`.

Imp ↔ React Flow topology conversion lives in `imp-react-flow` (imp-ts). This package owns the interactive editor shell and operator node UI.

## Exports

| Path | Role |
| --- | --- |
| `./config` | Inbound-edge helpers (`dedupeInboundReactFlowEdges`, `withoutInboundToPort`) |
| `./editor` | `ImpFlowEditor`, `impFlowDeleteKeyCode` |
| `./imp-nodes` | Operator node components / palette helpers |
| `./path-hop-options` | Optional traverse hop option types + `matchPathHopRelation` |

## Constraints

- Callers **must** pass `createRegistry` — do not hard-wire `tome-imp-sql` here.
- Optional `pathHopOptions` enables ontology traverse UI; builders that load flatfile schemas stay in `tome-query`.
- CSS prefix: `.tome-rf-*` (not query-specific).

## Tests

```bash
bun test   # from this package, or: bun run --filter tome-react-flow test
```
