# tome-sequencing

## Summary

**tome-sequencing** is a page-block extension that arranges related events on a relative timeline. Event membership comes from a **page-scoped Imp query** (React Flow fence data, like tome-query). Interpretation (depends association, default duration, optional duration/parallel Imp graphs) comes from per–type-table [`content/model/sequencing.json`](../../packages/tome-flatfile/src/sequencing/sequencing-file.ts). **Layout** (non-overlapping ASAP placements + concurrency lanes) comes from [`tome-sequencing-resolution`](./tome-sequencing-resolution.md)—the display is a thin renderer of that output.

## When to read this

- Timeline page block, sequencing.json, or Arcs-style relative chronology
- Page-scoped Imp binding (`$pageNodeId`)
- visx timeline chrome / view options

## Requirements

### Packages

| Package | Role |
| --- | --- |
| `tome-sequencing-interfaces` | Shared domain types only |
| `tome-sequencing-resolution` | Constraint solve + layout placements (`resolve`, `layoutEvents`) |
| `tome-sequencing` | Extension: query → problem → resolve/layout → visx / static SVG |

### Block storage

- Fence component id: `tome-sequencing.block`
- Block `data`: `{ version: 1, reactFlow: { nodes, edges } }`
- At execute time, Imp/React Flow string literals equal to `$pageNodeId` are replaced with the host page node id (unlike tome-query v1, which ignores `nodeId`); Imp `parameter` nodes are bound from invoke `parameters` / user settings

### sequencing.json

- Keyed by type-table / set node id
- Configures depends association, default duration, optional track/membership fields (reserved; **macro tracks deferred**—layout ignores `trackProperty` / layer banding for now), optional containment association, optional agent-authored Imp duration/parallel graphs
- Does **not** list which events appear (the block query does)

### Timeline UI

- **htmlModule** renders a **static SVG timeline** for the static site (and other non-interactive hosts)
- In the editor, the block is **`interactive: true`**: if `editor.js` fails to load, the embed shows an **error** (not the static SVG), so a broken load is obvious
- Interactive visx canvas adds **horizontal zoom only** (wheel / pinch on the time axis; drag pans time). Vertical scale is fixed; the block **grows with lane content** (no inner vertical scroll viewport)
- Upper-right **settings gear** (⚙) opens a view-settings menu (see [tome-editor.md](./tome-editor.md) § View settings control):
  - **Show chronology units** — relative-time axis ticks/labels (default **on**; session only)
  - **Show dependency edges** — cubic depends curves between visual bar endpoints (default **off**; persisted in `.tome/user-settings.json` as `sequencing.showDependencyEdges`; static HTML omits edges)
- When the Imp query graph declares **`parameter` nodes**, those appear in the same settings menu and persist in `.tome/user-settings.json` (`blockParameters`) per page node + component id
- Timeline chrome uses a **dark** palette by default (dark canvas, teal event bars, light labels)
- **Flat concurrency lanes** only (no Epic/Primary/Secondary macro bands). Each event is one ASAP bar `[start, end)`; same-lane bars do not overlap. ALAP slack is not drawn as occupying geometry.
- Event bars keep `<a href="?node=…">` for Ctrl/Cmd / middle / shift-click. Unmodified left click `preventDefault`s and `stopPropagation`s so Milkdown/chrome link interceptors do not navigate, then opens a two-column **dependency popup** (Dependencies / Dependents). The popup title is a node link. Each listed edge shows the other event plus `${from} → ${to}` (e.g. `end → start`). **Add Start** / **Add End** enter pick mode for that endpoint of the current event; other events split **left (start) / right (end)** behind the still-visible title (Cancel / Escape). Delete removes that endpoint combo. Mutations use invoke actions `addDepends` / `removeDepends`. `readOnly` popups are view-only.
- **Show dependency edges** cubics attach to the chosen bar ends (left = start, right = end), not always finish-to-start.

### Editor UX

- `interactive: true` embed with Refresh + **Edit query** (host tool panel React Flow editor); shows an explicit load error if the browser bundle is unavailable
- Server `invoke` actions:
  - `arrange` / `execute` — layout DTO
  - `addDepends` / `removeDepends` — `{ prerequisiteId, dependentId, from, to, data, parameters? }` mutates one start/end combo on the `dependsAssociation` row (direction 0 = prerequisite → dependent; `properties.endpoints` is `{ from, to }[]`) then re-arranges. Missing `endpoints` fails arrange. On resolve failure, returns `{ ok: false, error, depends }` so the client can keep previous placements and still list the new edge.
- Client may pass `parameters` (resolved graph parameter values) on invoke
- At execute time, Imp/React Flow string literals equal to `$pageNodeId` are replaced with the host page node id, and `parameter` node values are bound from user settings (defaults from the graph when unset)

## Design rationale

Notion-style absolute dates are a poor fit for story chronology. Relative depends plus automatic arrangement (like ELK / fcose for diagrams) match how authors reason about order. Page-scoped Imp queries keep the block reusable across hub pages without hard-coding membership in model JSON.

## Behavior / pipeline

1. Run block Imp query with page `nodeId` bound → event rows (`id`, title)
2. Load `sequencing.json` for that page id
3. Load depends edges among result ids (association direction 0 = prerequisite → dependent; expand `properties.endpoints` into `DependsConstraint` rows with `from` / `to`)
4. `resolve` → constraint windows
5. `layoutEvents` → non-overlapping ASAP placements + lanes
6. Render visx / static SVG from placements only

## Configuration

See Marloth `content/model/sequencing.json` and `extensions.json` registration for `tome-sequencing`.

## Verification

```bash
bun run --filter tome-sequencing-interfaces test
bun run --filter tome-sequencing-resolution test
bun run --filter tome-sequencing test
```

## See also

- [tome-sequencing-resolution.md](./tome-sequencing-resolution.md)
- [tome-query.md](./tome-query.md)
- [extensions.md](./extensions.md)
