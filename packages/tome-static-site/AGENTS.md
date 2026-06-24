# Tome static site — agent notes

## What it is

Astro-based static site generator that exports every node in `content/` to HTML under `dist/web/` (default). Each page mirrors the editor’s read-only node view: metadata (with backlinks), properties, markdown body, Items tables, and relation tables with cross-links. Multi-tab type-table hubs get sibling URLs under `{urlPath}/tabs/{tabId}/`. Nodes may optionally set frontmatter `url_alias` for human-readable URL paths (static site only).

## Run

From repo root:

```bash
bun run web:build
bun run web:build -- --out-dir=/path/to/output --base=/design/
```

From this package:

```bash
bun run build
bun test
```

Help: `bun run web:build -- --help`

## Configuration

CLI overrides environment (see `--help`):

| Flag | Env | Default |
| --- | --- | --- |
| `--out-dir` | `TOME_WEB_OUT_DIR` | `{repoRoot}/dist/web` |
| `--content-dir` | `TOME_CONTENT_PATH` | `./content` |
| `--db-path` | `TOME_DB_PATH` | `data/tome.sqlite` |
| `--base` | `TOME_WEB_BASE` | `/` |

## Output layout

- `index.html` — landing page (static-site home node from `content/model/workspace.json` → `staticSite.homeNodeId`)
- `{urlPath}/index.html` — one page per content node (`urlPath` = `url_alias` or lowercase node id)
- `{urlPath}/tabs/{tabId}/index.html` — extra tab pages for multi-tab type-table hubs only
- `_astro/` — bundled assets (includes sort + metadata client script)

## Repo-wide context

- **Feature spec:** [`docs/features/static-website.md`](../../../docs/features/static-website.md)
- **Graph storage:** [`docs/features/tome-db.md`](../../../docs/features/tome-db.md)
- Root [`AGENTS.md`](../../AGENTS.md)
