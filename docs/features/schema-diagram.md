# Schema diagram (ELK + inline SVG)

## Summary

The **schema diagram** page block (`schema-diagram.block`, package `tome-schema-diagram`) renders a node-link diagram of the project's **meta-model**: type tables and their relation columns from `table-schemas.json`. Diagrams are laid out with **ELK.js** and emitted as **inline SVG** server-side for both the editor and static site.

## When to read this

- Editing `packages/tome-schema-diagram/`
- Schema diagram block config or ELK/SVG generation
- Page blocks with `renderMode`

For page-block contracts: [page-blocks.md](../extensions/page-blocks.md). For extensions: [extensions.md](./extensions.md).

## Requirements

### Diagram content (v1)

- **Entities:** type tables from `table-schemas.json` (titles from graph nodes)
- **Member badges:** each type table shows a notification-style pill with `member_of` set size (`setMemberIds`); hidden when count is 0; corner placement is project-configurable (see below)
- **Edges:** `table-schemas.json` relation columns — one directed edge per column (`sourceTypeId` → `targetTypeId`), labeled by `perspective` (fallback `key`)
- **Default scope:** full project (all types and relation columns)
- **Optional filters:** block `data` may restrict `typeIds` and `relationshipTypes` (matches column `perspective` / `key` labels)

`schema.json` `relationshipRules` are used for editor enforcement (allowed targets, link picker) — not for diagram edges.

### Rendering

- `prepare-editor-body` and static site build expand blocks to inline `<svg>` inside `.tome-schema-diagram-viewport`
- Layout runs server-side via **elkjs** (`layered` algorithm); no client-side diagram rendering
- Editor webview attaches **pan/zoom** via [`svg-pan-zoom`](https://github.com/bumbu/svg-pan-zoom) to the pre-rendered SVG
- **Pan:** drag inside the viewport
- **Zoom:** mouse wheel over the viewport; toolbar buttons for zoom in, zoom out, and reset (fit + center)
- Block storage remains `tome-block` fenced JSON

### Static site

- `renderMode: "static"` uses the same SVG render path when `schemaQuery` is provided by the host
- `tome-static-site` wires `createExtensionSchemaQueryServices` in `generate-data.ts`

## Pipeline

```
extensions.json + table-schemas.json
  → createExtensionSchemaQueryServices (host) — includes memberCount per type table
  → buildElkGraph → layoutElkGraph → renderSchemaDiagramSvg
  → <figure class="tome-schema-diagram"><div class="viewport"><svg>…</svg></div></figure>
  → editor webview: svg-pan-zoom viewport (optional interactivity)
```

## Block configuration

| Key | Default | Purpose |
| --- | --- | --- |
| `typeIds` | (all) | Restrict diagram entities |
| `relationshipTypes` | (all) | Filter edge labels (`perspective` / column `key`) |
| `theme` | `default` | Diagram palette (`data-theme` on figure) |
| `direction` | `TB` | `TB` or `LR` (ELK `DOWN` / `RIGHT`) |

## Workspace configuration

Project-wide diagram options live in `content/model/workspace.json` under `schemaDiagram` (same file as `spatialGraph` settings). Applies to all schema diagram blocks in the editor and static site.

| Key | Default | Purpose |
| --- | --- | --- |
| `memberBadgePosition` | `bottom-right` | Corner for member-count pills: `top-left`, `top-right`, `bottom-left`, or `bottom-right` |

Example:

```json
"schemaDiagram": {
  "memberBadgePosition": "top-right"
}
```

Reload the editor or rebuild the static site after changing `workspace.json`.

## Verification

```bash
bun test packages/tome-schema-diagram/tests
bun test packages/tome-db/tests/extension-schema-query.test.ts
bun test packages/tome-db/tests/workspace-schema-diagram.test.ts
bun test packages/tome-editor/tests/api/prepare-editor-body-schema-diagram.test.ts
bun test packages/tome-editor/tests/webview/schema-diagram-viewport.test.ts
bun test packages/tome-static-site/tests/extensions/schema-diagram-html.test.ts
```

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `tome-schema-diagram/src/build-elk-graph.ts` | Schema snapshot → ELK graph JSON |
| `tome-schema-diagram/src/layout-elk.ts` | ELK layout |
| `tome-schema-diagram/src/render-svg.ts` | Laid-out graph → SVG string |
| `tome-schema-diagram/src/render.ts` | HTML figure shell (editor + static) |
| `tome-schema-diagram/src/html.ts` | Page-block registration |
| `tome-db/src/extension-schema-query.ts` | Host service for type tables + relation column edges |
| `tome-editor/.../schema-diagram-viewport.ts` | Client pan/zoom on pre-rendered SVG |
| `tome-static-site/src/generate-data.ts` | Supplies `schemaQuery` and `schemaDiagram` workspace options at build time |

## See also

- [schema.md](./schema.md) — relationship rules
- [table-schemas.md](./table-schemas.md) — type table columns
- [spatial-graph.md](./spatial-graph.md) — instance diagrams (Cytoscape SSR)
