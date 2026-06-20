# Static website generation

Generate a portable, dark-themed static HTML site from every node in `content/`.

## Summary

The `tome-static-site` package reads the git-tracked design corpus via `tome-db`, builds one page per node with Astro, and writes output to `dist/web/` by default. Pages mirror the editor’s read-only node view: metadata, properties, markdown body, Items tables, and relation tables with cross-links. The primary use case is embedding this output into a larger parent static site.

## When to read this

- Adding or changing static export behavior
- Configuring output paths or base URL for embedding
- Understanding what each generated page includes

## Requirements

- **Must** include every node returned by `ContentStore.listNodeIds()` (~all `content/data/*.md` files).
- **Must** render title, markdown body, metadata (including backlinks), type properties, relation tables, and type-table Items tables per node.
- **Must** rewrite internal graph links (`./{id}.md`, `marloth:{id}`, `[[id]]`, and legacy Notion `{32-hex}.md` paths) to static node URLs.
- **Must** use a dark theme consistent with the Marloth editor palette.
- **Must** write to `dist/web/` by default; output directory **must** be configurable for external tools.
- **Must** support a configurable Astro `base` path for subdirectory embedding.
- **May** expose a VS Code task and root `web:build` script.

## Design rationale

Astro produces plain static HTML suitable for copying into any host or parent build. The Bun generate phase syncs `content/` into SQLite and calls `getNodePageDetail` so export reuses the same graph assembly as the editor. Astro loads generated JSON only (no `bun:sqlite` in the Node build). A small client script adds column sorting and collapsible metadata; table tabs on multi-tab type-table hubs use separate static sibling URLs.

## Behavior / pipeline

1. `build.ts` parses CLI/env config and sets `MARLOTH_*` env vars.
2. **Generate (Bun):** `generate-data.ts` opens `openContentGraph`, calls `getNodePageDetail` per node, and writes `src/generated/site-data.json` (gitignored). Multi-tab type-table hubs also get per-tab Items payloads for non-default tabs.
3. **Build (Astro/Node):** Astro loads the generated JSON.
4. Each node page: metadata panel (with optional properties when expanded), markdown (links rewritten), Items table (default tab), relation sections.
5. **Tab sibling pages** (multi-tab type-table hubs only): `/nodes/{id}/tabs/{tabId}/` — full page chrome with that tab’s Items table; tab bar links between URLs.
6. **Landing page** (`index.html`): full render of the static-site home node (`STATIC_SITE_HOME_NODE_ID` in `generate-data.ts`; independent of the editor’s `DEFAULT_HOME_NODE_ID`).
7. Astro writes `index.html`, `nodes/{id}/index.html`, optional `nodes/{id}/tabs/{tabId}/index.html`, and `_astro/` assets.

## Page contents (read-only editor parity)

| Section | Notes |
| --- | --- |
| Title + archived badge | From node detail |
| Metadata | Collapsible; created/modified, relationship count, backlinks, and Properties on instance pages when expanded (`?meta=1` expands) |
| Markdown body | Callouts, dynamic `[[id]]` links |
| Items table | Type-table hubs; row name links, relation-cell links, sortable columns |
| Relation tables | Per outgoing relationship group; name links |

## Client interactivity

- **Sortable columns:** click table headers (client-side; respects tab default sort until overridden).
- **Metadata:** collapsed by default; `?meta=1` expands on load.
- **Tabs:** plain links between static pages (no tab JavaScript).

## Not exported (editor-only)

Editing, add-row/link-existing, row actions, drag-reorder, table search, tab/column CRUD, relation-cell editors, enum editing, user-settings persistence.

## Inputs / outputs / artifacts

| Input | Source |
| --- | --- |
| Nodes | `content/data/{id}.md` |
| Relationships | `content/data/relationships.json` via SQLite rebuild |
| Workspace model | `content/model/` (`views.json`, `schema.json`, `table-schemas.json`, `dynamic-fields.json`) |

| Output | Default path |
| --- | --- |
| Site root | `dist/web/index.html` (static-site home node) |
| Node pages | `dist/web/nodes/{id}/index.html` |
| Tab pages | `dist/web/nodes/{id}/tabs/{tabId}/index.html` |
| Assets | `dist/web/_astro/` |

Output is gitignored (`**/dist/`).

## Quick start

```bash
bun run web:build
```

VS Code: **Tasks: Run Task** → **Marloth: build static website**, then **Marloth: serve static website** → http://127.0.0.1:8787/ (override port with `MARLOTH_WEB_PORT`).

## Configuration

Precedence: **CLI flags > environment > defaults**.

| Option | CLI | Env | Default |
| --- | --- | --- | --- |
| Output directory | `--out-dir` | `MARLOTH_WEB_OUT_DIR` | `{repoRoot}/dist/web` |
| Content directory | `--content-dir` | `MARLOTH_CONTENT_PATH` | `./content` |
| SQLite cache | `--db-path` | `MARLOTH_DB_PATH` | `data/marloth.sqlite` |
| Site base (embedding) | `--base` | `MARLOTH_WEB_BASE` | `/` |

Embedding example:

```bash
bun run web:build -- --out-dir=/other-project/public/design --base=/design/
```

Copy the output directory into the parent project's static assets; internal links include the base prefix.

## Verification

```bash
bun run --cwd packages/tome-static-site test
bun run web:build
# open dist/web/index.html or serve dist/web locally
```

## Implementation pointers

| Piece | Path |
| --- | --- |
| Package | `packages/tome-static-site/` |
| Build entry | `src/build.ts` |
| Content → JSON (Bun) | `src/generate-data.ts`, `src/lib/static-export.ts` |
| Generated input | `src/generated/site-data.json` (gitignored) |
| Config | `src/config.ts` |
| Astro data loader | `src/lib/content.ts` |
| Markdown + links | `src/lib/markdown.ts` |
| Node page shell | `src/components/NodePage.astro` |
| Client JS | `src/lib/client/page-interactions.ts` |
| Section styles | `src/lib/node-sections.css` |
| Astro pages | `src/pages/` |
| Dark theme | `src/lib/theme.css` |

## See also

- [`static-website-deploy.md`](./static-website-deploy.md) — GitHub Actions deploy to S3 / CloudFront
- [`tome-db.md`](./tome-db.md) — content store and cache
- [`tome-editor.md`](./tome-editor.md) — editor theme and link conventions
- [`packages/tome-static-site/AGENTS.md`](../packages/tome-static-site/AGENTS.md)
