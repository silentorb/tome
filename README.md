# Tome

Domain-agnostic tooling for git-tracked design graphs: SQLite query cache (`tome-db`), web editor (`tome-editor`), and static site export (`tome-static-site`).

## Packages

| Package | Role |
| ------- | ---- |
| `packages/tome-db/` | Property graph storage, content sync, schema loaders |
| `packages/tome-editor/` | Bun API + Vite/React markdown editor |
| `packages/tome-static-site/` | Astro static site generator |

## Development

This repo is typically opened via **silentorb-workbench**, which bind-mounts `tome` and a domain repo (e.g. marloth-story) and runs the editor in a Compose `tome` service with `TOME_CONTENT_PATH` pointing at the domain `content/` directory.

Standalone (with `TOME_CONTENT_PATH` set):

```bash
bun install --frozen-lockfile
bun run editor:dev
```

See [`AGENTS.md`](./AGENTS.md) and [`docs/features/`](./docs/features/) for feature specs.
