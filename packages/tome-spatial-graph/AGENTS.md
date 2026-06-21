# tome-spatial-graph — agent notes

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
| `src/build-elements.ts` | Placements + cytoscape elements (multi-parent duplication) |
| `src/layout-svg.ts` | Headless fcose + SVG export via jsdom |
| `src/render.ts` | Shared html/server render pipeline |
| `src/html.ts` / `server.ts` / `editor.tsx` | Subsystem registrations |
