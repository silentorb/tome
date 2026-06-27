# tome-spatial-graph — agent notes

**Feature spec:** [`docs/features/spatial-graph.md`](../../docs/features/spatial-graph.md) — integration principles, config, known Cytoscape limits.

## Run / test

```bash
bun test   # from this package
```

## Dependencies

Only `tome-interfaces` (+ cytoscape stack, jsdom, React for editor entry). No `tome-db` / `tome-editor`.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | Parse block `data` JSON |
| `src/build-elements.ts` | Placements + cytoscape elements (multi-parent duplication, neighbor scoping) |
| `src/layout-svg.ts` | Headless fcose + SVG export via jsdom |
| `src/svg-export.ts` | Append-only link overlays |
| `src/render.ts` | Shared html/server render pipeline |
| `src/html.ts` / `server.ts` / `editor.tsx` | Subsystem registrations |

## Agent constraints

- Configure layout via Cytoscape stylesheet and fcose — no post-layout coordinate shifts.
- Do not rewrite cytoscape SVG geometry (trim, edge fallback, strip exported edges).
- Link overlays are the only allowed post-`cy.svg()` step.
