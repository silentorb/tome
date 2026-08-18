# tome-sequencing — agent notes

**Feature spec:** [`docs/features/tome-sequencing.md`](../../docs/features/tome-sequencing.md)

## Dependencies

- `tome-interfaces`, `tome-sequencing-interfaces`, `tome-sequencing-resolution`
- `tome-imp-sql` / Imp via `tome-query` execute helpers + React Flow query editor
- Local `sequencing.json` parse/load (flatfile owns store watching of the same file)
- visx for the timeline canvas

Do not import `tome-editor` / `tome-db`.

## Page-scoped Imp query

Block fence `data.reactFlow` is canonical. At execute time, string literals equal to `$pageNodeId` are replaced with the host page node id (unlike tome-query v1). Imp `parameter` node values are bound from user settings / invoke `parameters` before compile.

## Timeline settings

Upper-right **⚙** opens view settings (chronology units on by default — session only; dependency edges off by default — persisted in user settings) plus any graph `parameter` controls (persisted in user settings). Follow the gear-menu convention in [`tome-editor.md`](../../docs/features/tome-editor.md) § View settings control. Timeline chrome is dark by default for contrast. Layout comes from `tome-sequencing-resolution` (`layoutEvents`); this package does not invent macro tracks or ALAP range bars.

Unmodified left click on an event opens a dependency popup (add via click-to-pick, remove via delete). Invoke actions `addDepends` / `removeDepends` mutate graph edges through host `graphMutate`.

## Static HTML vs editor

`htmlModule` renders a static SVG timeline for the **static site**. In the editor the block is interactive; a failed `editor.js` load must surface as an error embed, not the static SVG.

## Run

```bash
bun test
```
