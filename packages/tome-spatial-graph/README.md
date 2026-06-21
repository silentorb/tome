# tome-spatial-graph

Tome extension that renders compound spatial graphs (hierarchy + neighbor edges) as SVG using cytoscape.js and fcose.

## Exports

- `tome-spatial-graph/editor` — slash menu block registration
- `tome-spatial-graph/html` — static site SVG rendering
- `tome-spatial-graph/server` — invoke handler for SVG/elements

Block configuration lives in each page's `tome-block` fence `data` JSON. The hosting page node is treated as the `is_a` type table.
