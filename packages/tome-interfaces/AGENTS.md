# tome-interfaces — agent notes

## What it is

**General Tome integration contracts** — types and small runtime helpers that external modules implement to plug into Tome hosts. **Not** an extension-specific package; the extension system is the first consumer.

## Dependency rules

- **No** dependencies on `tome-editor`, `tome-db`, or `tome-static-site`.
- Includes executable runtime (page-block fence parse) — not a types-only package.
- Extension packages should depend **only** on `tome-interfaces` (+ their own deps, e.g. React for editor entries).

## Layout

| Subpath | Contents |
| --- | --- |
| `tome-interfaces/page-block` | Fence parse/serialize, `PageBlockPayload` |
| `tome-interfaces/page-block/editor` | `EditorPageBlock`, `EditorPageBlockHost` |
| `tome-interfaces/page-block/html` | `HtmlPageBlockRenderer`, `HtmlPageBlockHost` |
| `tome-interfaces/page-block/server` | `ServerPageBlockHandler`, `ServerPageBlockHost` |
| `tome-interfaces/extension-services/graph-query` | `ExtensionGraphQueryServices` for host-provided graph reads |

## Run / test

```bash
bun test   # from this package
```

## See also

- [extensions.md](../../../docs/features/extensions.md) — extension registration system
- [page-blocks.md](../../../docs/extensions/page-blocks.md) — page-block integration guide
