# Page blocks

Custom in-body blocks stored as fenced markdown and integrated via **separate contracts per consumer**.

## Contracts (authoritative)

Defined in `tome-interfaces`:

| Subsystem | Import | Role |
| --- | --- | --- |
| Editor | `tome-interfaces/page-block/editor` | Slash menu, in-editor presentation |
| HTML | `tome-interfaces/page-block/html` | Raw HTML fragment (any consumer) |
| Server | `tome-interfaces/page-block/server` | Optional invoke handler |

Shared storage helpers: `tome-interfaces/page-block` (`parsePageBlockFences`, `serializePageBlock`, `expandPageBlockFencesForEditor`, `collapsePageBlockEmbedsForStorage`).

A logical block **may** implement editor only, html only, server only, or any combination. Link implementations with the same `implementationId` in config.

## Storage format

````markdown
```tome-block
{"componentId":"my-ext.block","data":{}}
```
````

- `componentId` matches a row in `extensions.json` `components[]`.
- `data` is opaque JSON interpreted by the block implementations.

## Editor host (`tome-editor`)

- Loads `editorModule` (slash-menu defaults via manifest), `htmlModule`, and `serverModule` at API startup.
- **`POST /api/nodes/:id/prepare-editor-body`** expands `tome-block` fences to embedded HTML before Milkdown loads (uses the same `htmlModule` renderers as static export).
- Display markdown embeds each block as an HTML comment (canonical JSON payload) plus rendered HTML (e.g. inline SVG):

```markdown
<!-- tome-page-block {"componentId":"spatial-graph.block","data":{...}} -->
<figure class="tome-spatial-graph">…</figure>
```

- Slash menu inserts fences via `serializePageBlock` (defaults from manifest `insertDefaultData`).
- On save, `normalizeEditorBody` collapses embeds back to `tome-block` fences (same pattern as dynamic link prepare/collapse).
- No ProseMirror NodeView or client extension bundles required for in-editor block display.

## HTML host (v1: static site generate)

- Loads `htmlModule` during `tome-static-site` `generate-data.ts`.
- Parses fences, renders prose with `marked`, substitutes `HtmlPageBlockRenderer.renderHtml()` output.
- Pre-rendered HTML stored on each node as `bodyHtml` in `site-data.json`.
- Missing html renderer → `unknownPageBlockHtml()` fallback.

## Server host (`tome-editor` API)

- Loads `serverModule` at API startup.
- `POST /api/extensions/:componentId/invoke` dispatches to registered handler (stub-friendly).
- Handlers receive `ServerHostServices` including optional `graphQuery` (`tome-interfaces/extension-services/graph-query`) for read-only graph access.

## Graph query services

Host-side helper: `createExtensionGraphQueryServices(db)` in `tome-db`.

| Method | Purpose |
| --- | --- |
| `listTypeMembers(typeId)` | Nodes with `is_a → typeId` |
| `listEdges({ nodeIds, types? })` | Incident edges among a node set |

Wired into:

- **Editor API** — `ExtensionServerRuntime.invokeExtension()` and `prepareEditorBody()` pass `services.graphQuery`
- **Static site generate** — `PageBlockHtmlContext.graphQuery` during `renderNodeBodyHtml()`

## HTML async render

`HtmlPageBlockRenderer.renderHtml()` may return `string | Promise<string>`. Hosts await the result before substituting block HTML.

## Example package layout

```
packages/my-blocks/
  src/editor.tsx    → export function register(host: EditorPageBlockHost)
  src/html.ts       → export function register(host: HtmlPageBlockHost)
  src/server.ts     → export function register(host: ServerPageBlockHost)
```

Reference: `packages/tome-extension-fixture/`. Production example: `packages/tome-spatial-graph/` (local block `data` config, SVG via cytoscape).
