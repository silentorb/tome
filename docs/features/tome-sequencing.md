# tome-sequencing

## Summary

**tome-sequencing** is a page-block extension that arranges related events on a relative timeline. Event membership comes from a **page-scoped Imp query** (React Flow fence data, like tome-query). Interpretation (depends association, default duration, track property, optional duration/parallel Imp graphs) comes from per–type-table [`content/model/sequencing.json`](../../packages/tome-flatfile/src/sequencing/sequencing-file.ts). Layout ranges come from [`tome-sequencing-resolution`](./tome-sequencing-resolution.md).

## When to read this

- Timeline page block, sequencing.json, or Arcs-style relative chronology
- Page-scoped Imp binding (`$pageNodeId`)
- visx timeline chrome / view options

## Requirements

### Packages

| Package | Role |
| --- | --- |
| `tome-sequencing-interfaces` | Shared domain types only |
| `tome-sequencing-resolution` | `resolve` + range outputs |
| `tome-sequencing` | Extension: query → problem → resolve → visx UI |

### Block storage

- Fence component id: `tome-sequencing.block`
- Block `data`: `{ version: 1, reactFlow: { nodes, edges } }`
- At execute time, Imp/React Flow string literals equal to `$pageNodeId` are replaced with the host page node id (unlike tome-query v1, which ignores `nodeId`)

### sequencing.json

- Keyed by type-table / set node id
- Configures depends association, default duration, optional track property, optional `membershipAssociation` (to read track values from hub→member edge properties), optional containment association, optional agent-authored Imp duration/parallel graphs
- Does **not** list which events appear (the block query does)

### Timeline UI

- **htmlModule** renders a **static SVG timeline** for the static site (and other non-interactive hosts)
- In the editor, the block is **`interactive: true`**: if `editor.js` fails to load, the embed shows an **error** (not the static SVG), so a broken load is obvious
- Interactive visx canvas adds independent X/Y zoom (plain wheel → X, Shift+wheel → Y)
- Upper-right **settings gear** (⚙) opens a view-settings menu (see [tome-editor.md](./tome-editor.md) § View settings control). Session UI state only (not persisted). Options:
  - **Show chronology units** — relative-time axis ticks/labels (default **on**)
  - **Show dependency edges** — depends lines between events (default **off**; static HTML omits edges)
- Event glyphs are `<a href="?node=…">` for same-tab / new-tab navigation

### Editor UX

- `interactive: true` embed with Refresh + **Edit query** (host tool panel React Flow editor); shows an explicit load error if the browser bundle is unavailable
- Server `invoke` action `arrange` returns layout DTO

## Design rationale

Notion-style absolute dates are a poor fit for story chronology. Relative depends + possibility ranges match how authors reason about order and slack. Page-scoped Imp queries keep the block reusable across hub pages without hard-coding membership in model JSON.

## Behavior / pipeline

1. Run block Imp query with page `nodeId` bound → event rows (`id`, title, track fields)
2. Load `sequencing.json` for that page id
3. Load depends edges among result ids (association direction 0 = prerequisite → dependent)
4. `resolve` → ranges
5. Render visx timeline (tracks from `trackProperty` or `default`)

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
