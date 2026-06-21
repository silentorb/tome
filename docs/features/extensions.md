# Extension system

## Summary

The **extension system** lets projects register external packages that add Tome capabilities. Extensions are **libraries of components** configured in `content/model/extensions.json` and **loaded at runtime**. Each component kind exposes **separate integration contracts per consumer subsystem** (editor, html, server) defined in [`tome-interfaces`](../packages/tome-interfaces/) — not in this doc.

v1 implements the **page-block** kind (custom in-body blocks).

## When to read this

- Registering or authoring extensions
- `content/model/extensions.json`
- Runtime loading, manifest API, subsystem module paths
- Page blocks in editor or static export

For contract details: [page-blocks.md](../extensions/page-blocks.md) and package [`tome-interfaces/AGENTS.md`](../packages/tome-interfaces/AGENTS.md).

## Requirements

### Registration

- Extension registration **must** live in `content/model/extensions.json` under the content root.
- Each enabled extension **must** list subsystem module paths it implements: `editorModule`, `htmlModule`, `serverModule` (all optional).
- Components **must** declare `kind`, `implementationId`, and `extensionId`; hosts merge extension-level and component-level `params`.
- Hosts **must** dynamically import enabled extension modules at runtime (Bun `import()`).
- Extension packages **must not** depend on `tome-editor`, `tome-db`, or `tome-static-site`; they **must** depend on `tome-interfaces` for contracts.

### Page blocks (v1)

- Storage **must** use shared `tome-block` fenced JSON (see [page-blocks.md](../extensions/page-blocks.md)).
- Editor-only blocks **are valid** (no html module required).
- HTML rendering uses general-purpose `HtmlPageBlockRenderer` — not static-site-specific types.

### Reload

- `extensions.json` changes **must** invalidate the tome-db loader cache (`ContentWatcher` + `invalidateExtensionsCache`).
- Editor API reloads extension modules when config mtime changes (`ExtensionServerRuntime.ensureLoaded()`).

### Out of scope (v1)

- Config UI for extensions
- Non–page-block component kinds
- Marketplace / remote unsigned extensions
- Independent front/back configuration rows for a single logical component

## Design rationale

### `tome-interfaces` vs extension system

Integration **contracts** live in `tome-interfaces` (general-purpose). The **extension system** (this feature) handles discovery, config, and runtime loading. Future non-extension consumers may use the same interfaces.

### Per-consumer modules

A logical component (e.g. Timeline) links subsystem implementations by `implementationId` but loads **separate modules** per consumer. Avoids god objects and keeps editor, html, and server layers isolated.

### Prototype stage

No backwards-compatibility guarantees. Refactor hosts and contracts freely.

## Behavior / pipeline

```
extensions.json
  → tome-db loadExtensionsFromContent / resolveExtensionsManifest
  → Editor API: import editorModule + htmlModule + serverModule → register hosts
  → Webview: GET /api/extensions (manifest) + POST prepare-editor-body (expand blocks) → Milkdown
  → Static generate: import htmlModule → render bodyHtml
```

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `content/model/extensions.json` | Extension + component registration |
| `packages/tome-interfaces/` | Integration contracts + fence parse |
| `packages/tome-editor/src/api/extensions/` | Server runtime, manifest, bundle route |
| `packages/tome-editor/src/webview/extensions/` | Slash menu for page blocks |
| `packages/tome-static-site/src/extensions/` | HTML subsystem loader |
| `packages/tome-extension-fixture/` | Test/reference extension |
| `packages/tome-spatial-graph/` | Spatial graph page block (cytoscape SVG) |

Hosts expose **`ExtensionGraphQueryServices`** (`tome-interfaces/extension-services/graph-query`) to server and HTML block renderers via `createExtensionGraphQueryServices()` in `tome-db`. HTML renderers may return async `renderHtml()` results.

## Configuration

`extensions.json` shape:

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "my-ext",
      "enabled": true,
      "editorModule": "my-ext/editor",
      "htmlModule": "my-ext/html",
      "serverModule": "my-ext/server",
      "params": {}
    }
  ],
  "components": [
    {
      "id": "my-ext.block",
      "extensionId": "my-ext",
      "kind": "page-block",
      "implementationId": "my-block",
      "label": "My block",
      "enabled": true,
      "slashMenu": { "group": "custom", "order": 10 },
      "params": {}
    }
  ]
}
```

Module paths resolve as workspace package names (e.g. `tome-extension-fixture/editor`) or paths relative to the content root.

## Quick start

1. Author a package with `tome-interfaces` contracts (see fixture).
2. Add rows to `content/model/extensions.json`.
3. Restart editor API / rebuild static site.

## Verification

```bash
bun test packages/tome-interfaces/tests
bun test packages/tome-db/tests/extensions.test.ts
bun test packages/tome-editor/tests/extensions
bun test packages/tome-editor/tests/webview/page-block-menu.test.ts
bun test packages/tome-editor/tests/api/prepare-editor-body-api.test.ts
bun test packages/tome-static-site/tests/extensions
```

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `tome-db/src/extensions/` | Parse/load `extensions.json`, resolve manifest |
| `tome-editor/src/api/extensions/runtime.ts` | Server-side dynamic import + manifest + prepare-editor-body |
| `tome-editor/src/webview/extensions/` | Slash menu for page blocks |
| `tome-static-site/src/lib/page-block-html.ts` | HTML pipeline during generate |

## See also

- [page-blocks.md](../extensions/page-blocks.md)
- [tome-editor.md](./tome-editor.md)
- [static-website.md](./static-website.md)
