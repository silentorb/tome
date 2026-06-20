# Tome Editor

## Summary

Browser-based markdown editor for Marloth design nodes backed by `content/data/` node files and a local SQLite query cache. Delivered as a React + Milkdown (Crepe) UI (Vite) with a Bun HTTP API for graph access.

## When to read this

Read this doc when your task involves:

- Editing graph node bodies (`body` property on nodes)
- Cross-linking between design nodes in markdown
- The Marloth editor API or webview packages
- Notion-like editing UX for the design corpus
- Graph Explorer (multi-resolution graph visualization)

For graph storage semantics, read [`tome-db.md`](./tome-db.md) and [`../ontology.md`](../ontology.md).
For Graph Explorer LOD layers and clustering, read [`graph-explorer.md`](./graph-explorer.md).

## Requirements

### Editing model

- The editor **must** read and write node bodies via `tome-db` (`ContentStore` → `content/data/{id}.md`).
- Every node **must** render as a **universal page** with this block order: **page title** (standalone textarea) → collapsible **metadata** panel (timestamps, backlinks, and optional **Properties** when expanded) → **markdown body** (Milkdown) → optional relationship and database table sections derived from graph relationships.
- Because the page title is rendered outside the markdown body, heading levels in stored markdown **must** render one level deeper in the page body (`h1` → rendered `h2`, `h2` → rendered `h3`, etc.).
- Instance pages (`NotionPage` with `(page)-[:IS_A]->(type)`) **must** show a **Properties** section inside the expanded metadata panel when the type defines one or more stored scalar fields and/or dynamic computed fields for that database. Stored scalars (e.g. Priority) are editable; computed dynamic fields are read-only. Properties **must** show singular stored scalars and computed fields on the `is_a` edge only — not relationship membership. When Properties is shown, the **`IS_A` relationship table section must still appear** below the markdown body; type membership is edited there (Link / Remove), not in Properties.
- Relationship tables **must** group outgoing relationships by label; relationship properties (except import metadata like `ordinal`, `via_view`) **must** appear as table columns.
- Database table sections **must** appear on `NotionDatabase` nodes, built from incoming `IS_A` relationships (Name from linked pages; scalar columns from `IS_A` properties; relation columns from linked targets on outgoing graph relationships — see [tome-db.md](./tome-db.md) `getDatabaseViewDetail`).
- The API **must** load `content/` on startup (full cache rebuild if stale), watch `content/data/` and `content/model/` for changes, and sync into `TOME_DB_PATH (fallback: MARLOTH_DB_PATH)` (see tome-db).
- Autosave **should** debounce writes (default ~800ms after last edit).
- Local UI preferences (table sort order, active table tab, etc.) **must** persist in a gitignored user settings file (`.tome/user-settings.json (legacy: .marloth/user-settings.json)` by default), storing sparse overrides only—not full copies of graph data.
- Section tables **must** support sortable columns; default sort is Name ascending. Sort preferences **must** persist per section table across sessions.
- Active table view tab per node page **must** persist in `.tome/user-settings.json (legacy: .marloth/user-settings.json)` (`tableTabs`, keyed by `records/{nodeId}/tab`). On load, an explicit `?tab=` URL wins over the saved tab; otherwise the saved tab is restored and reflected in the URL.
- Each node page **must** include a collapsible **metadata** panel below the page title. When expanded, it shows timestamps, backlinks, and optional Properties (instance pages only). Collapsed by default; `?meta=1` expands (not persisted in user settings).
- **Connections** — total incident graph relationships (in + out). **Backlinks** — prose-only discovery: other pages whose markdown `body` links here (inline `marloth:` or export-style links). Backlinks are a gap-filler for references not already visible in relation/database sections; typed graph relationships are excluded.
- Database table sections on type-table nodes **must** use tab definitions from [`views.json`](./views.md): **custom** tabs (name + sorts, editable in UI) or **generated** tabs (e.g. Scenes book scope via `scenes-by-book`). Column typing comes from [`table-schemas.json`](./table-schemas.md). Optional section-level **`columnOrder`** in `views.json` overrides default column ordering; users can drag column headers to reorder and persist that override. Stored columns **must** be addable/editable/deletable in the UI via **+ Column** and the column header context menu (`POST`/`PATCH`/`DELETE` `/api/databases/:id/columns…`); dynamic columns stay read-only.
- Database table **relation columns** (`type: relation` in synced `notion_schema`) **must** be editable in the UI: the cell shows a compact summary (max width `14rem`, ~6 lines) of **inline wrapping navigable links** (outline page icon prefix, off-white text—not pill badges) for visible records, with overflow as `N+` when more links exist. Links use plain `<a href="?node=…">` elements (native navigation). An **edit control** in a fixed column immediately right of the links box (shown on cell hover or focus) opens a popup listing all links (remove per row) plus a searchable add control (filtered by the relation property’s target database when `config.database_id` is present). Linking uses `POST /api/nodes/:rowId/connections`; unlinking uses `DELETE /api/nodes/:rowId/connections/:label/:targetId`. Relation scope is inferred from the row's `is_a` membership in the table database (see [tome-db.md](./tome-db.md)).

### Cross-linking and navigation links

**Native link behavior (app chrome).** Any navigational UI **outside the Milkdown editor body** that opens another node **must** be a real `<a href="…">` anchor. Pointer navigation **must** rely on the browser’s native link behavior (plain click, Ctrl/Cmd+click, middle-click, shift-click, and context-menu actions). **Do not** attach `onClick`, `onAuxClick`, or similar mouse handlers on those anchors; **do not** call `preventDefault()` on link activation for same-tab navigation; **do not** use `window.open()` or imperative routing for mouse-driven navigation. If a widget cannot satisfy this (e.g. no resolvable `href`), **stop and ask** whether an exception is acceptable before adding custom click handling.

Applies to: sidebar nav, **Recent**, global search result rows, database relation column cell labels, edit-popup row links, section table name cells, metadata backlinks, and similar app chrome. Does **not** apply to the Milkdown markdown body (see below).

| Context | `href` for node pages |
| --- | --- |
| Browser editor (display) | `?node={id}` (see `standaloneNodeUrl` in `src/webview/node-links.ts`) |

**Milkdown body links.** The markdown editor is **exempt** from the native-only pointer rule above. Use Crepe/Milkdown defaults unless there is a product reason not to — **`LinkTooltip` enabled** (hover preview, edit/remove). Cross-link navigation in the editor body uses **JS click handling** on the Milkdown root (`handleEditorLinkPointerEvent` in `src/webview/editor-link-navigation.ts`), calling `navigateStandaloneNode` / `openStandaloneNodeInNewTab` from `node-links.ts`. Do not add custom ProseMirror plugins whose goal is to force native browser link behavior inside contenteditable.

Keyboard shortcuts in combobox-style pickers (global search, Relate, record link picker) may simulate anchor clicks on **Enter** when focus is in the search field; result rows themselves remain anchors for pointer navigation.

- Internal links **must** be stored in git-tracked markdown in one of two forms:
  - **Static title:** `[Custom text](./{nodeId}.md)` (see `canonicalNodeMarkdownHref` in `tome-db/markdown-links.ts`) when the author overrides the displayed label.
  - **Dynamic title:** `[[{nodeId}]]` — no title stored; the displayed label is resolved from the target node’s `title` property at render time.
- **Load/save transforms happen outside Milkdown** (same as static links): `prepareEditorMarkdown` expands storage to editor display markdown; `normalizeEditorBody` collapses back before `PUT`. Milkdown only sees standard `[text](href)` links. Dynamic links use an ephemeral `?node={id}&dynamic=1` href in the live editor (not stored).
- On load, `prepareEditorMarkdown` expands `./{nodeId}.md` → `?node=` and `[[{nodeId}]]` → `[title](?node={id}&dynamic=1)` (titles fetched via the API). On save, `normalizeEditorBody` collapses `dynamic=1` links → `[[{nodeId}]]` and other node links → `./{nodeId}.md`. Legacy `marloth:{id}`, `marloth://node/{id}`, `?node=` / `?record=` absolute URLs, and Notion export paths still resolve at read time.
- `@` autocomplete **must** search existing nodes by title and insert a **dynamic** link (`formatEditorDynamicNodeLink` → stored as `[[{nodeId}]]` after save).
- Dynamic links **must** show the same file icon as relation table cells (prefix before the link in Milkdown). Static-titled links do not show the icon.
- If the user edits the text of a dynamic link in Milkdown, the link **must** demote to a static `[text](./{nodeId}.md)` link on save.
- Clicking a cross-link in the Milkdown body: plain click → same tab via JS (`navigateStandaloneNode`); Ctrl/Cmd+click or middle-click → new tab via JS (`openStandaloneNodeInNewTab`).
- Legacy Notion export links (32-hex id embedded in path) **should** resolve at navigation time without requiring a bulk migration.
- **Global search** result rows **must** be `<a href="…">` elements (not `<button>` with `onClick`), using `?node=` URLs.
- Database relation column cell labels, edit-popup row links, section table name cells, and sidebar nav follow the **native link behavior (app chrome)** rule.
- **Milkdown body** receives display hrefs in the markdown passed to Crepe (`prepareEditorMarkdown`); persisted bodies use `[[{nodeId}]]` or `./{nodeId}.md`. ProseMirror plugins handle dynamic-link icon decoration and demotion on text edit only — not storage parsing.

### Entry / navigation

- Default home is configured in `content/model/workspace.json` (`homeNodeId`; Marloth corpus: `13458e628ba28073850dea0edb9acde1`) when that node exists in the graph; open via sidebar **Home** or `?node=` for the home id. Sidebar quick links (Features, Scenes, …) come from `workspace.sidebar.links` in the same file.
- Node pages use URL query `?node={id}` (32-char hex).
- A **global search** widget **must** let users find and open any node by title (via `GET /api/nodes/search`). Each result **must** be a native link (`<a href>` per **Native link behavior (app chrome)** above). A configuration bar offers **Search node contents** (markdown body); when enabled, the client passes `includeBody=1` and title matches are listed before body-only matches. When **Search node contents** is on and the query matches a node body, each result may include a `matchPreview` excerpt (up to two lines, match emphasized) below the title; title-only matches show the title line only. The preference is stored in `.tome/user-settings.json (legacy: .marloth/user-settings.json)` (`globalSearch.includeBody`). Open via sidebar **Search** or **Ctrl/Cmd+K**. Enter (with focus in the search field) activates the highlighted result via native anchor behavior; Ctrl/Cmd+Enter opens in a new tab. `@` mention and Relate pickers use title-only search (no `includeBody`). When the search field is empty, node search results are ordered by title ascending; when the user types a query, results are ordered by title relevance (exact and prefix matches, then closer/shorter titles). The same relevance ordering applies to record link pickers, inline table name filters, and the Relate dialog’s relationship-type picker.
- A **Recent** sidebar section **must** appear directly below the static database links. It lists the latest nodes by node `modified_at` (set on create and updated on title/body save; relationship-only edits do not affect recency). Archived nodes are excluded. Each row **must** be a native link (`<a href>` per **Native link behavior (app chrome)** above). The list length is configurable via `.tome/user-settings.json (legacy: .marloth/user-settings.json)` (`sidebar.recentMaxItems`, default 8). Data comes from `GET /api/nodes/recent?limit=…`.

### Presentation

- The editor UI **must** default to a **dark** theme, independent of OS `prefers-color-scheme`.
- Shared colors **must** live as `--tome-*` CSS custom properties on `:root` in `src/webview/styles.css`; canvas or library code that cannot use CSS directly should read those tokens (see `src/webview/theme.ts`).
- Editable **enum** property fields (Properties section and database/relation table cells) **should** use collapsed pill labels that open a popover option list on click (Notion-like), not native `<select>` controls. Empty values **must** show a muted placeholder until the user picks an option—never display a schema default as if it were already stored.

### Interaction targets

Pointer handlers (click, context menu, drag affordances) **must** cover the **full visual box** the user sees—a table header cell, tab, row strip, cell chrome—not just the label text inside it.

- **Do not** attach handlers to `inline-flex` / shrink-wrapped wrappers around labels when the surrounding box has padding or empty space (common with `<th>` / `<td>` padding). Users expect to interact anywhere in that box.
- **Prefer** making the interactive element itself fill the box (`<button>` spanning a tab, a block-level header wrapper) or add an explicit fill layer.
- **Table cells with outer padding:** when the handler must be an inner wrapper (e.g. context menu separate from sort/drag on the same `<th>`), extend the wrapper into the cell padding—see `.tome-column-header-menu-wrap` in `section-data-table.css` (`margin` negates `<th>` padding; `padding` restores layout).
- **Overlay hit layer:** when nested content must stay pointer-transparent (e.g. native `<a>` links inside a cell), use an absolutely positioned fill control—see `.tome-relation-cell-hit-area` in `relation-cell-editor.css` (`inset: 0` on a button over the cell content box).
- **Regression:** column-header context-menu fill is asserted in `database-table-layout.test.tsx`.


- Development uses Vite dev server + Bun API (`bun run editor:dev`).
- The webview calls the REST API directly (via `src/shared/http-client.ts`); Vite proxies `/api` to the editor API port.

### Node creation

- **New page** (sidebar **New page** or `?view=create`) **must** immediately create a standalone `NotionPage` with default title `Untitled` (no relationships) and open the universal node edit page so the user can set title and body there.
- **Database (IS_A) table add row** — type-table **Items** sections (`section.type === "database"`) **must** offer an inline **New row** control that creates a new type instance and links it via `is_a` (`POST /api/databases/:id/rows`). The new row **must** appear after reload.
- **Associative relation table link** — many-to-many outgoing relation sections (`addMode: "link-existing"`, e.g. Features, Inspirations, Characters) **must** offer an inline **Link** control that picks an **existing** record (`POST /api/nodes/:id/connections`), scoped by `allowedTargetTypeIds` from `schema.json` when a rule matches. Structural one-to-many relation sections (`addMode: "none"`, e.g. Part) **must not** show a table-level add control; ordered-association tables are unchanged.
- Relation table sections only appear when the page already has at least one outgoing edge for that label. Every non-protected node page **must** offer **Relate** in the page actions menu (⋯ to the right of the page title) to open a dialog linking the current page to an **existing** target: searchable relationship type (`GET /api/relationship-types`, all types present in data) and searchable target node (`GET /api/nodes/search`, optionally filtered via `GET /api/nodes/:id/relationship-link-options?type=…` from `schema.json`). Linking uses `POST /api/nodes/:id/connections`; the page reloads so new relation sections appear when applicable.
- Database table **relation columns** (`type: relation` in synced `notion_schema`) **must** be editable in the UI (link/unlink existing rows via the same connections API).

### Out of scope (v0.1)

- Editing relationships from the UI beyond: ordered-association reorder/part moves (see [ordered-associations.md](./ordered-associations.md)), stored type-membership scalars in the Properties section, type-membership link/unlink in the `IS_A` relation table section, **create** flows that mint new IS_A type instances (database add row), **link existing targets** (Relate dialog, associative relation table **Link**, database relation columns), and enum/scalar patches on existing edges
- Weighted relationships or typed link metadata in the editor

## Design rationale

### Notion-like UX on graph data

Design work in Marloth is relational and markdown-heavy. A web editor with `@` linking matches author mental models from Notion while preserving git-tracked `content/` files as source of truth and a SQLite cache for fast graph queries.

### HTTP API for graph access

`tome-db` uses Bun's built-in SQLite. A small localhost REST API keeps one database implementation, enables browser-based editing, and gives agents a simple curl/fetch verification surface.

The webview calls this REST API directly (via shared client in `src/shared/http-client.ts`).

**Workspace config:** `GET /api/workspace` returns parsed `content/model/workspace.json` (home/archive/protected node ids, sidebar links, branding, graph explorer default anchor). The webview loads this on boot; `GET /api/home` still resolves the effective home node id (workspace home when present, else most recent node).

## Behavior / pipeline

```
User edit (webview)
  → PUT /api/nodes/:id (shared REST client)
  → tome-db mergeNodeProperties(body)
  → SQLite data/tome.sqlite (legacy: data/marloth.sqlite)
```

Changing nodes is real URL navigation (`?node=`). Browser back/forward use normal history entries—not an in-app navigation stack.

Search/autocomplete:

```
@ query → GET /api/nodes/search?q=… → title summaries (relevance order when q is non-empty)
Global search (Ctrl/Cmd+K) → same endpoint; optional `includeBody=1`; empty query lists recent nodes by title
```

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `packages/tome-editor/` | API + browser webview |
| `data/tome.sqlite (legacy: data/marloth.sqlite)` | Node bodies and metadata (query cache) |
| `packages/tome-editor/dist-webview/` | Production webview bundle |

## Quick start

The editor API and Vite dev server **start automatically** when the devcontainer starts (Dockerfile `CMD`: `bun install --frozen-lockfile` then `bun run editor:dev`) or when you open this workspace in VS Code/Cursor outside a devcontainer (task **Marloth Editor: dev servers**, `runOn: folderOpen`). Manual restart: `bash scripts/tome-editor-start` or `bun run editor:dev`.

```bash
bun run editor:dev
# → UI http://127.0.0.1:5173 (Vite proxies /api to the editor API on port 3847)
# Open the UI URL in the browser; do not open the API port directly.
```

Production UI bundle: `bun run editor:build` → `packages/tome-editor/dist-webview/`.

## Configuration

| Setting | Environment | Default |
| --- | --- | --- |
| Database path | `TOME_DB_PATH (fallback: MARLOTH_DB_PATH)` | `data/tome.sqlite (legacy: data/marloth.sqlite)` |
| API port | `MARLOTH_EDITOR_API_PORT` | `3847` |
| Dev webview URL | `MARLOTH_EDITOR_WEBVIEW_URL` | `http://127.0.0.1:5173` |
| User settings file | `TOME_USER_SETTINGS_PATH (fallback: MARLOTH_USER_SETTINGS_PATH)` | `.tome/user-settings.json (legacy: .marloth/user-settings.json)` (repo root) |

## Verification

- `bun test` (repo root — runs tome-db unit tests and tome-editor typecheck + unit/component tests)
- `bun run --cwd packages/tome-editor test` includes `tsc -p tsconfig.check.json` (webview/shared/api)
- Component smoke tests use synthetic fixtures in `src/webview/test-fixtures/` (no real graph content)
- **Regression tests:** bug fixes for table views, dynamic fields, or related API endpoints must include a failing test seeded with composite relationship types when graph traversal is involved (see root `AGENTS.md`).

### Test coverage map

| Requirement | Primary tests |
| --- | --- |
| Database table assembly (`getDatabaseViewDetail`) | `packages/tome-db/tests/database-view.test.ts`, `database-view-relations.test.ts` |
| Ordered-association part tables | `packages/tome-db/tests/ordered-associations.test.ts` |
| Dynamic computed columns | `packages/tome-db/tests/dynamic-fields/dynamic-fields.test.ts` |
| Composite relationship traversal | `packages/tome-db/tests/relationship-traverse.test.ts` |
| Database table UI | `packages/tome-editor/tests/webview/components/DatabaseTableView.test.tsx` |
| Shared sortable table UI | `packages/tome-editor/tests/webview/components/SectionDataTable.test.tsx`, `database-table-layout.test.tsx` (column header hit-area CSS) |
| Relation / enum cell rendering | `table-cell-render.test.tsx`, `RelationSectionView.test.tsx`, `EnumSelectCell.test.tsx` |
| Database HTTP API | `packages/tome-editor/tests/api/database-view-api.test.ts`, `edge-property-api.test.ts` |
| Table sort persistence | `packages/tome-editor/tests/shared/user-settings.test.ts`, `user-settings-api.test.ts` |
| Recent sidebar panel | `packages/tome-db/tests/queries.test.ts`, `packages/tome-editor/tests/api/recent-nodes-api.test.ts`, `RecentNodesPanel.test.tsx` |
| Properties section (stored + dynamic) | `NodePageView.test.tsx`, `node-type-properties.test.ts` |

- Manual: open home → edit → reload → body persisted
- Manual: `@` search inserts link; click cross-link in Milkdown body navigates (JS-mediated); Ctrl+click opens new tab; sidebar/table links use native browser navigation
- Manual: open any node with relation sections and confirm tables render
- Manual: click a section table column header to sort; reload and confirm sort persists in `.tome/user-settings.json (legacy: .marloth/user-settings.json)`
- Manual: switch a database table tab; navigate away and return (or reload without `?tab=`); confirm the same tab is active and `tableTabs` updated in `.tome/user-settings.json (legacy: .marloth/user-settings.json)`
- Manual: sidebar **Recent** lists latest edited nodes below static database links; edit a title/body and confirm the node moves to the top after save
- Manual: sidebar **New page** or `?view=create` → lands on new node page titled Untitled; `content/data/{id}.md` exists
- Manual: on an IS_A database table section, **+ New row** → new row appears after reload
- Manual: on an associative relation table section (e.g. Features), **Link** / **+ Link …** → pick existing record; row appears after reload
- Manual: on a database table with relation columns (e.g. Features → Parents), click link labels to navigate; hover the cell and use the edit control to open the popup for add/remove; confirm `content/data/relationships.json` updates

## Implementation pointers

| Module | Responsibility |
| --- | --- |
| `packages/tome-editor/src/api/server.ts` | Bun HTTP API |
| `packages/tome-editor/src/api/user-settings-store.ts` | Local user settings file I/O |
| `packages/tome-editor/src/shared/user-settings.ts` | User settings types and table sort helpers |
| `packages/tome-editor/src/webview/` | React + Milkdown Crepe UI |
| `packages/tome-editor/src/webview/components/NodePageView.tsx` | Universal page layout (title, metadata, properties, markdown, sections) |
| `packages/tome-editor/src/webview/App.tsx` (`createNewPage`) | New-page auto-create + navigation |
| `packages/tome-editor/src/webview/components/GlobalSearch.tsx` | Global node search |
| `packages/tome-editor/src/webview/components/RecentNodesPanel.tsx` | Sidebar recent nodes (`GET /api/nodes/recent`) |
| `packages/tome-db/src/node-create.ts` | Create node + optional relationship (`createNode`) |
| `packages/tome-editor/src/webview/components/PropertiesSectionView.tsx` | Instance-page Properties form (stored + computed fields) |
| `packages/tome-editor/src/webview/components/RelationSectionView.tsx` | Outgoing relationship table section |
| `packages/tome-db/src/queries.ts` | Node get/search/save helpers |
| `packages/tome-db/src/node-page-sections.ts` | Section assembly for node page API |
| `packages/tome-db/src/page-properties.ts` | Instance-page Properties section (`buildPropertiesSection`) |

## See also

- [tome-db.md](./tome-db.md)
- [graph-explorer.md](./graph-explorer.md)
- [ordered-associations.md](./ordered-associations.md)
- [`../ontology.md`](../ontology.md)
- [`packages/tome-editor/AGENTS.md`](../../packages/tome-editor/AGENTS.md)
