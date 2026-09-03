# Tome Editor — agent notes

## What it is

Browser editor for design corpus nodes. **Client-only** — talks to `tome-server` / `tome-http` over HTTP. Uses **Milkdown Crepe** for block-based markdown with `@` cross-link autocomplete.

## Terminology

- **Node** — graph entity; API `GET/PUT /api/nodes/:id`, search `GET /api/nodes/search`.
- **Page** — `NodePageView` UI for one node (title, metadata, sections).
- **Relationship** — graph relationship; relationship property edits via `/api/nodes/:id/relationships/...`.
- Navigation: `?node={id}` (`standaloneNodeUrl` in `src/webview/node-links.ts`).

## Theme

The editor is **dark-first** and uses the **Midnight** theme from `tome-theme-midnight` (`import "tome-theme-midnight/tokens"` in `main.tsx`). Milkdown loads `frame-dark.css`; code blocks use Crepe’s One Dark CodeMirror theme. New UI should use `--tome-*` tokens (add tokens to `tome-theme-midnight/src/tokens.css` rather than hardcoding colors). Editor shell and interactive overrides live in `src/webview/styles.css` and component CSS.

## View settings control

View/visualization toggles use a **⚙ gear** in the upper-right (not a “View options” text button). See [`docs/features/tome-editor.md`](../../../docs/features/tome-editor.md) § View settings control. Reference: Graph Explorer `GraphView`, sequencing timeline.

## Interaction targets

Pointer handlers **must** match the **full visual box** (header cell, tab, row), not shrink-wrapped label text. Avoid `onContextMenu` / `onClick` on `inline-flex` wrappers inside padded table cells.

**Patterns in this package:**

| Case | Reference |
| --- | --- |
| Column header context menu fills `<th>` | `section-data-table.css` → `.tome-column-header-menu-wrap`; wrapper is direct child of `<th>` in `SortableDataColumnHeaders.tsx` |
| Relation cell opens editor popup | `relation-cell-editor.css` → `.tome-relation-cell-hit-area` (`position: absolute; inset: 0`) |
| Tab select / context menu | `TableUtilityBar.tsx` — `<button>` is the tab chrome |

See [`docs/features/tome-editor.md`](../../../docs/features/tome-editor.md) § Interaction targets. `database-table-layout.test.tsx` guards the column-header fill CSS.

## Extensions

Editor hosts **editor** page-block UI. Server-side extension runtime lives in **`tome-server`**. See [`docs/features/extensions.md`](../../../docs/features/extensions.md).

| Path | Role |
| --- | --- |
| `src/webview/extensions/` | Slash menu for page blocks |

## Architecture

| Layer | Path | Runtime |
| --- | --- | --- |
| Graph + host | `tome-server` (+ `tome-db`) | Bun |
| HTTP service | `tome-http` (loaded by server config) | Bun |
| Webview UI | `src/webview/` | Browser (Vite) |

The webview talks to the Bun REST API on `http://127.0.0.1:3847` (proxied as `/api` in dev).

**Do not import the `tome-db` barrel from webview code.** `tome-db` re-exports `tome-sqlite` (`bun:sqlite`), which Vite cannot run in the browser. Use browser-safe subpaths only (`tome-db/document-to-storage-body`, `tome-db/table-rows-window`, `tome-db/association-label`, `tome-db/enum-codec`, `tome-db/row-sort-helpers`, `tome-db/search-relevance`) or types from `tome-graph-interfaces`.

**Data transport:** webview → REST (`tome-http` client via `src/shared/http-client.ts`).

**Link/navigation convention (read [`docs/features/tome-editor.md`](../../../docs/features/tome-editor.md) § Cross-linking):** stored markdown bodies use `./{nodeId}.md`; markdown passed to Milkdown uses `?node=` display hrefs (`prepareEditorMarkdown` / `normalizeEditorBody`). The editor is an **SPA for same-tab hops** (`pushState` + `loadNode` / `hydrateFromLocation`; `popstate` for back/forward). Prefer real `<a href="?node=…">` so right-click / shift-click / middle-click stay native; plain clicks may `preventDefault` via `attachStandaloneChromeNavigation` or `navigateStandaloneNode`. Emulate hard-open on non-anchor controls (`openStandaloneNodeInNewTab` / `openStandaloneNodeInNewWindow`). Milkdown: `editor-link-navigation.ts` — honors `defaultPrevented`, skips `[data-type="tome-page-block-react"]`, and JS-emulates Ctrl/Cmd+click because ProseMirror claims that gesture for node selection (`editor-link-hard-open.ts`). Graph Explorer: `api.navigate`. Helpers: `nodePageHref()` / soft-nav APIs in `src/webview/node-links.ts`.

## Run

From repo root:

```bash
# API host (config-driven; includes tome-http by default)
bun run server:dev
# → http://127.0.0.1:3847

# Browser UI + API
bun run editor:dev
# → http://127.0.0.1:5173
```

Build webview: **Tasks: Run Task** → **Tome Editor: build**, or `bun run editor:build`.

## Tests

```bash
bun test packages/tome-editor/tests
bun test packages/tome-server/tests
bun test packages/tome-db/tests
```

Bun `mock.module` is process-wide and is not restored between files. Do not mock modules that other tests import for real behavior (e.g. `graph-canvas-size`); stub canvas size via `installGraphCanvasTestEnv` (`tests/webview/test-fixtures/canvas-container-size.ts`).

### Regression tests

When fixing table-view bugs, add a regression test in the same change. Prefer `seedTestCompositeRelationships` (or full `ContentStore` sync) for graph traversal bugs so tests match production relationship composite types. Do not close a bug fix without a test unless the user explicitly waives it.

**Table layout / column width / horizontal scroll:** extend [`tests/webview/components/database-table-layout.test.tsx`](tests/webview/components/database-table-layout.test.tsx). It checks CSS max-width values and scroll-container rules.

## Repo-wide context

- Feature spec: [`docs/features/tome-editor.md`](../../../docs/features/tome-editor.md)
- Server hub: [`docs/features/tome-server.md`](../../../docs/features/tome-server.md)
- Graph Explorer: [`docs/features/graph-explorer.md`](../../../docs/features/graph-explorer.md)
- Graph storage: [`docs/features/tome-db.md`](../../../docs/features/tome-db.md)
- Root [`AGENTS.md`](../../AGENTS.md)
