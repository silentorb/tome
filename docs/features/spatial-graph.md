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

## Workspace configuration

Project-wide node geometry is configured in `content/model/workspace.json` (git-tracked). Applies to all spatial graph blocks in the editor and static site build.

| Key | Default | Purpose |
| --- | --- | --- |
| `spatialGraph.nodeDimensionScale.x` | `1` | Horizontal scale for leaf node width and compound horizontal padding; text wrap width matches leaf node width |
| `spatialGraph.nodeDimensionScale.y` | `1` | Vertical scale for leaf node height and compound bottom padding |

Example:

```json
"spatialGraph": {
  "nodeDimensionScale": { "x": 1.75, "y": 1.0 }
}
```

**Label text does not scale** with these values — only node shape and horizontal text-wrap room change. Font sizes remain fixed (`10` leaf, `11` compound parent). Values are clamped to `0.5`–`4.0` at render time.

Types and normalization are exported from `tome-spatial-graph/config` (`SpatialGraphWorkspaceConfig`, `normalizeNodeDimensionScale`, `resolveSpatialGraphConfig`).

Reload the editor page or rebuild the static site after changing `workspace.json`.

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
| Neighbor edges in nested compounds | Supported with **fixed numeric** node `width`/`height` | Do **not** use `width: 'label'` / `height: 'label'` — breaks bezier edge export |
| Node labels fitting inside shapes | Partially addressed | Baseline 40×40 ellipse; widen/tall via `spatialGraph.nodeDimensionScale` in workspace.json |
| Clickable nodes in static SVG | Not in cytoscape-svg | Append-only link rects |
| Responsive width | Host CSS on figure | `max-width: 100%` on SVG — no SVG root rewriting |
| Top-aligned compound parent labels | Stylesheet `padding-top` on `:parent` | Configure via `parentHeaderHeight`; escalate if insufficient |

### Node sizing and edge export

Use **numeric** `width` and `height` in the node stylesheet ([`layout-svg.ts`](../packages/tome-spatial-graph/src/layout-svg.ts)). Cytoscape's deprecated `width: 'label'` / `height: 'label'` values prevent bezier edge geometry (`allpts`) from being computed in compound graphs, so cytoscape-svg exports no neighbor strokes. This is a renderer limitation triggered by label-based sizing, not missing graph data.

Adequate label spacing uses workspace `nodeDimensionScale` to enlarge node geometry without scaling font size. Per-label dynamic sizing remains out of scope (requires numeric width/height — see below).

Canvas-to-SVG export is inherently fragile; see [cytoscape.js#639](https://github.com/cytoscape/cytoscape.js/issues/639). If a requirement cannot be met via Cytoscape configuration, stop and propose design — do not improvise export workarounds.

## Out of scope

- Graph Explorer LOD (separate feature; force-directed canvas)
- Client-side live Cytoscape in the editor (future design)
- Custom SVG edge/node redraw layers
