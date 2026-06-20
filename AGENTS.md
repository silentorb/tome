# AGENTS Guide — Tome

## Repository purpose

**tome** holds domain-agnostic packages for git-tracked design graphs. Domain-specific node IDs, navigation, and workspace identity belong in each project's `content/model/workspace.json` — not in package source.

| Package | Role |
| ------- | ---- |
| `packages/tome-db/` | SQLite cache, content sync, schema/model loaders |
| `packages/tome-editor/` | Bun REST API + Vite/React editor webview |
| `packages/tome-static-site/` | Astro static export |
| `packages/tome-interfaces/` | Integration contracts for external modules |
| `packages/tome-extension-*/` | Optional extensions (e.g. `tome-extension-fixture` for tests) |

Each package has a brief **`README.md`** (context) and **`AGENTS.md`** (how to work in the package). See [`packages/README.md`](./packages/README.md).

## Project context

- Run tests: `bun test` at repo root.
- Feature specs: [`docs/features/`](./docs/features/) (read only the doc matching your task).
- Package notes: each package's `README.md` (context) and `AGENTS.md` (implementation).
- **Regression tests:** When fixing table views, dynamic fields, or related API bugs, add a regression test in the same change.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `TOME_CONTENT_PATH` | Content root (`content/`) |
| `TOME_DB_PATH` | SQLite cache (default: `{content}/../data/tome.sqlite`) |
| `TOME_EDITOR_API_PORT` | API port (default 3847) |
| `TOME_EDITOR_DEV_HOST` | Vite bind host (default `127.0.0.1`; use `0.0.0.0` in containers) |

## Workbench integration

In **silentorb-workbench**, this repo mounts at `repos/tome/`. The Compose `tome` service runs `editor:dev` with `TOME_CONTENT_PATH` pointing at the domain repo (e.g. marloth-story `content/`).
