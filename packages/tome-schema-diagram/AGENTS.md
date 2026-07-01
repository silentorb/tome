# tome-schema-diagram — agent notes

**Feature spec:** [`docs/features/schema-diagram.md`](../../docs/features/schema-diagram.md)

## Run / test

```bash
bun test   # from this package
```

## Dependencies

Only `tome-interfaces` (+ React for editor entry). No `tome-db` / `tome-editor`. Client Mermaid runs in the editor webview host.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse block `data` JSON |
| `src/build-mermaid.ts` | Schema snapshot → Mermaid `erDiagram` source |
| `src/render.ts` | Editor HTML shell + static placeholder |
| `src/html.ts` / `server.ts` / `editor.tsx` | Subsystem registrations |

## Agent constraints

- Do not import `tome-db`; consume `ExtensionSchemaQueryServices` from the host.
- v1 is editor-only rendering (client Mermaid); static export uses deferred placeholder via `renderMode: "static"`.
