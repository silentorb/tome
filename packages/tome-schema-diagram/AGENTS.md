# tome-schema-diagram — agent notes

**Feature spec:** [`docs/features/schema-diagram.md`](../../docs/features/schema-diagram.md)

## Run / test

```bash
bun test   # from this package
```

## Dependencies

`tome-interfaces`, `elkjs`, React (editor entry only). No `tome-db` / `tome-editor`. Pan/zoom runs in the editor webview host.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse block `data` JSON |
| `src/snapshot.ts` | Shared snapshot types + filtering |
| `src/build-elk-graph.ts` | Schema snapshot → ELK graph |
| `src/layout-elk.ts` | ELK layout |
| `src/render-svg.ts` | Laid-out graph → SVG |
| `src/render.ts` | HTML figure shell |
| `src/html.ts` / `server.ts` / `editor.tsx` | Subsystem registrations |

## Agent constraints

- Do not import `tome-db`; consume `ExtensionSchemaQueryServices` from the host.
- Layout and SVG rendering are server-side; editor only adds pan/zoom to pre-rendered SVG.
- Static site requires `schemaQuery` in page-block render context.
