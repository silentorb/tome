# Page blocks

Custom in-body blocks stored as fenced markdown and integrated via **separate contracts per consumer**.

## Contracts (authoritative)

Defined in `tome-interfaces`:

| Subsystem | Import | Role |
| --- | --- | --- |
| Editor | `tome-interfaces/page-block/editor` | Slash menu, in-editor presentation |
| HTML | `tome-interfaces/page-block/html` | Raw HTML fragment (any consumer) |
| Server | `tome-interfaces/page-block/server` | Optional invoke handler |

Shared storage helpers: `tome-interfaces/page-block` (`parsePageBlockFences`, `serializePageBlock`).

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

- Loads `editorModule` from each enabled extension (runtime `import()`).
- Serves bundled client modules at `GET /api/extensions/:extensionId/editor.js` (dev).
- Slash menu inserts fences via `serializePageBlock`.
- ProseMirror decoration marks `tome-block` code fences (`.tome-page-block-fence`).

## HTML host (v1: static site generate)

- Loads `htmlModule` during `tome-static-site` `generate-data.ts`.
- Parses fences, renders prose with `marked`, substitutes `HtmlPageBlockRenderer.renderHtml()` output.
- Pre-rendered HTML stored on each node as `bodyHtml` in `site-data.json`.
- Missing html renderer → `unknownPageBlockHtml()` fallback.

## Server host (`tome-editor` API)

- Loads `serverModule` at API startup.
- `POST /api/extensions/:componentId/invoke` dispatches to registered handler (stub-friendly).

## Example package layout

```
packages/my-blocks/
  src/editor.tsx    → export function register(host: EditorPageBlockHost)
  src/html.ts       → export function register(host: HtmlPageBlockHost)
  src/server.ts     → export function register(host: ServerPageBlockHost)
```

Reference: `packages/tome-extension-fixture/`.
