# Spatial graph (Cytoscape location diagrams)

## Summary

The **spatial graph** page block (`spatial-graph.block`, package `tome-spatial-graph`) renders compound hierarchy + neighbor adjacency diagrams as inline SVG on type-table pages (e.g. Marloth **Locations**). It uses **Cytoscape.js**, **fcose** layout, and **cytoscape-svg** export, pre-rendered at static-site build time and via editor `prepare-editor-body`.

## When to read this

- Editing `packages/tome-spatial-graph/`
- Location / spatial diagram layout or neighbor edge behavior
- Page-block integration for cytoscape diagrams

For page-block contracts: [page-blocks.md](../extensions/page-blocks.md). For package layout: [`tome-spatial-graph/AGENTS.md`](../packages/tome-spatial-graph/AGENTS.md).

## Integration principles

Agents **must** achieve behavior through Cytoscape **input data** (elements), **stylesheet**, **fcose options**, and **`cy.svg()` options**. Do not fight the renderer with post-layout coordinate shifts or SVG visual surgery.

**Allowed post-export step:** append-only clickable link overlays (`injectSpatialGraphNodeLinks`) — transparent `<a><rect>` hit targets that do not alter diagram geometry or strokes.

**Out of scope without design review:**

- Manual node position shifts after layout (e.g. post-fcose Y translation)
- Redrawing or stripping cytoscape-exported edges/nodes in SVG
- Custom SVG exporters that rebuild graphics from computed styles

## Pipeline

1. `selectSpatialGraph` — type members + incident edges via `ExtensionGraphQueryServices`
2. `buildSpatialGraphElements` — compound placements, multi-parent duplication, scoped neighbor edges
3. Headless Cytoscape + fcose + `cy.svg()`
4. Append link overlays
5. Host figure (`.tome-spatial-graph`) + CSS responsive scaling

## Block configuration

Block `data` JSON (in `tome-block` fence):

| Key | Default | Purpose |
| --- | --- | --- |
| `relationships.parentTypes` | `["parents"]` | Edge types: child → parent |
| `relationships.childTypes` | `["children"]` | Inverse parent edges (ignored when `parents` already declared) |
| `relationships.neighborTypes` | `["neighbor"]` | Undirected adjacency |
| `layout.*` | fcose defaults | Passthrough fcose options |
| `layout.parentHeaderHeight` | `28` | Top padding band for compound parent labels (stylesheet) |
| `svg.full` | `true` | Export full graph vs viewport |
| `svg.scale` | `1` | Export scale |
| `svg.bg` | (none) | Optional background color |

Hosting page node is the `is_a` type table scope.

## Graph construction rules

- **Multi-parent nodes** duplicate into separate Cytoscape elements (`canonicalId@parentElementId`) so one location can appear under multiple parents.
- **Neighbor edges** connect placement pairs when:
  - Both share the same immediate compound parent (siblings), or
  - At least one placement is root-level (cross-region neighbors).
- Neighbor edges **must not** connect placements nested under different parents (avoids spurious cross-path lines for multi-parent nodes).

## Known limitations

| Requirement | Native Cytoscape / cytoscape-svg | Stance |
| --- | --- | --- |
| Compound hierarchy + fcose | Supported | Use elements + layout config |
| Multi-parent duplication | Supported (data pattern) | Supported |
| Neighbor edges in nested compounds | Partial — cytoscape-svg may omit some compound edges | **Accept** until a vetted approach (PNG export, client-side Cytoscape, etc.) |
| Clickable nodes in static SVG | Not in cytoscape-svg | Append-only link rects |
| Responsive width | Host CSS on figure | `max-width: 100%` on SVG — no SVG root rewriting |
| Top-aligned compound parent labels | Stylesheet `padding-top` on `:parent` | Configure via `parentHeaderHeight`; escalate if insufficient |

Canvas-to-SVG export is inherently fragile; see [cytoscape.js#639](https://github.com/cytoscape/cytoscape.js/issues/639). If a requirement cannot be met via Cytoscape configuration, stop and propose design — do not improvise export workarounds.

### Observed (Marloth Locations, post-reset)

With 16 `neighbor` relationships in graph data, element construction yields 9 scoped cytoscape edges (after multi-parent / compound-context filtering). cytoscape-svg export visibly renders fewer edge strokes (~4) for nested compound graphs. This gap is **not** patched with SVG redraw layers — it matches the limitation above.

## Out of scope

- Graph Explorer LOD (separate feature; force-directed canvas)
- Client-side live Cytoscape in the editor (future design)
- Custom SVG edge/node redraw layers
