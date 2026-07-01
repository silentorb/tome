# Schema diagram (Mermaid ER diagrams)

## Summary

The **schema diagram** page block (`schema-diagram.block`, package `tome-schema-diagram`) renders an ER-style diagram of the project's **meta-model**: type tables and `schema.json` relationship rules. v1 targets **maintainers in the editor** — diagrams render client-side via Mermaid in the editor webview. Static site export shows a deferred placeholder.

## When to read this

- Editing `packages/tome-schema-diagram/`
- Schema diagram block config or Mermaid source generation
- Editor-only page blocks with `renderMode`

For page-block contracts: [page-blocks.md](../extensions/page-blocks.md). For extensions: [extensions.md](./extensions.md).

## Requirements

### Diagram content (v1)

- **Entities:** type tables from `table-schemas.json` (titles from graph nodes)
- **Edges:** `schema.json` `relationshipRules` — labeled by perspective `type`
- **Default scope:** full project (all types and rules)
- **Optional filters:** block `data` may restrict `typeIds` and `relationshipTypes`

### Editor rendering

- `prepare-editor-body` expands blocks to `<pre class="mermaid">` shells (Mermaid source only — no server SVG)
- Editor webview runs `mermaid.render()` on embed mount, then wraps the SVG in a fixed-height viewport with **pan/zoom** via [`svg-pan-zoom`](https://github.com/bumbu/svg-pan-zoom) (Mermaid core does not provide host-level pan/zoom)
- **Pan:** drag inside the viewport
- **Zoom:** mouse wheel over the viewport; toolbar buttons for zoom in, zoom out, and reset (fit + center)
- Block storage remains `tome-block` fenced JSON

### Static site (deferred)

- `renderMode: "static"` → placeholder HTML ("open in the editor to view")
- No `tome-static-site` package dependency in v1

## Pipeline

```
extensions.json + schema.json + table-schemas.json
  → createExtensionSchemaQueryServices (host)
  → prepare-editor-body → buildErDiagramMermaid → <pre class="mermaid">
  → Milkdown page block embed → mermaid.render() + svg-pan-zoom viewport
```

## Block configuration

| Key | Default | Purpose |
| --- | --- | --- |
| `typeIds` | (all) | Restrict diagram entities |
| `relationshipTypes` | (all) | Filter edge labels |
| `theme` | `default` | Mermaid theme (`data-mermaid-theme` on figure) |
| `direction` | `TB` | `TB` or `LR` in erDiagram source |

## Verification

```bash
bun test packages/tome-schema-diagram/tests
bun test packages/tome-db/tests/extension-schema-query.test.ts
bun test packages/tome-editor/tests/api/prepare-editor-body-schema-diagram.test.ts
bun test packages/tome-editor/tests/webview/schema-diagram-mermaid.test.ts
```

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `tome-schema-diagram/src/build-mermaid.ts` | Schema snapshot → Mermaid source |
| `tome-schema-diagram/src/html.ts` | Editor shell / static placeholder |
| `tome-db/src/extension-schema-query.ts` | Host service for type tables + rules |
| `tome-editor/.../schema-diagram-mermaid.ts` | Client Mermaid render + pan/zoom viewport |
| `tome-editor/.../page-block-embed.ts` | Calls Mermaid hook on embed mount; destroys pan/zoom on teardown |

## See also

- [schema.md](./schema.md) — relationship rules
- [table-schemas.md](./table-schemas.md) — type table columns
- [spatial-graph.md](./spatial-graph.md) — instance diagrams (Cytoscape SSR)
