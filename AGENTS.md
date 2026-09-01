# AGENTS Guide — Tome

## Repository purpose

**tome** holds domain-agnostic packages for git-tracked design graphs. Domain-specific node IDs, navigation, and workspace identity belong in each project's `content/model/workspace.json` — not in package source.

| Package | Role |
| ------- | ---- |
| `packages/tome-flatfile/` | Flatfile content store (canonical git-tracked data + change watching) |
| `packages/tome-sqlite/` | SQLite graph database (query cache today) |
| `packages/tome-db/` | Domain queries/mutations + content↔cache sync |
| `packages/tome-graph-interfaces/` | Domain DTOs + `TomeGraphServices` |
| `packages/tome-service-interfaces/` | Store/cache/service module contracts |
| `packages/tome-http/` | HTTP service module + client SDK |
| `packages/tome-server/` | Config-driven host (store, cache, services) |
| `packages/tome-editor/` | Vite/React editor webview (client only) |
| `packages/tome-static-site/` | Astro static export |
| `packages/tome-interfaces/` | Extension / page-block integration contracts |
| `packages/tome-imp-sql/` | Imp → Tome SQL schema/registry binder (above tome-db) |
| `packages/tome-query/` | Imp-backed custom table page block (React Flow → SQL) |
| `packages/tome-sequencing-interfaces/` | Shared sequencing domain types |
| `packages/tome-sequencing-resolution/` | Relative chronology constraint resolution |
| `packages/tome-sequencing/` | Timeline page block (Imp query + visx) |
| `packages/tome-extension-*/` | Optional extensions (e.g. `tome-extension-fixture` for tests) |

Each package has a brief **`README.md`** (context) and **`AGENTS.md`** (how to work in the package). See [`packages/README.md`](./packages/README.md).

## Project context

- Run tests: `bun test` at repo root (runs `bun run typecheck` first; typecheck failures block the suite).
- Typecheck only: `bun run typecheck` at repo root (all workspace packages with a `typecheck` script, including Imp via `../imp-ts/packages/*`). Treat typecheck failures as blocking when changing TypeScript.
- Feature specs: [`docs/features/`](./docs/features/) (read only the doc matching your task).
- Package notes: each package's `README.md` (context) and `AGENTS.md` (implementation).
- TypeScript-to-TypeScript imports are extensionless (no `.ts` suffix).
- **Regression tests:** When fixing table views, dynamic fields, or related API bugs, add a regression test in the same change.
- **UI tests:** New or changed React UI (editor webview, interactive page blocks, extension components) should include tests using **`bun:test`**, **`@testing-library/react`**, and **happy-dom** (`@happy-dom/global-registrator` via `--preload`). Follow the setup in `tome-editor` or `tome-query` (`tests/test-setup.ts`). Do not introduce a different DOM test runner for Tome UI packages.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `TOME_CONTENT_PATH` | Content root (`content/`) for solo sessions |
| `TOME_CORPORA` | Multi-corpus session: `id=/abs/path[:readonly]` pairs (comma-separated); see [`docs/features/multi-corpus.md`](./docs/features/multi-corpus.md) |
| `TOME_DB_PATH` | SQLite cache (default: `{content}/../data/tome.sqlite`; mixed sessions must use a dedicated session path) |
| `TOME_EDITOR_API_PORT` | HTTP API port (default 3847; historical name) |
| `TOME_EDITOR_DEV_HOST` | Vite bind host (default `127.0.0.1`; use `0.0.0.0` in containers) |
| `TOME_SERVER_CONFIG` | Path to `tome-server.json` (service module list) |

## Workbench integration

In **silentorb-workbench**, this repo mounts at `.mnt/tome/` (container path: `/workspaces/silentorb-workbench/.mnt/tome`). The Compose `tome` service runs `editor:dev` with `TOME_CONTENT_PATH` pointing at the domain repo (e.g. marloth-story `content/`).

Root `package.json` workspaces also include `../imp-ts/packages/*` so `tome-query` can depend on Imp (`imp-core-types`, `imp-sql`, …) while Imp remains a sibling repo mounted at `.mnt/imp-ts/`.

## Versioning

Packages use **0.x semver** (`0.MINOR.PATCH`). While `MAJOR` is 0, treat **`MINOR` as the API epoch** — bump it (reset `PATCH`) for breaking changes or new functionality; bump `PATCH` for backwards-compatible fixes only.

Internal workspace dependencies use caret-locked ranges: `"tome-db": "workspace:^0.2.0"`, `"imp-core-types": "workspace:^0.2.0"`. When a dependency's `MINOR` epoch changes, direct dependents must bump their `MINOR` too and update the range — including cross-repo when imp-ts packages change.

**Agent flow:** review the settled diff, classify each touched package (`minor` or `patch`), then run `bash scripts/bump-version.sh <package> <level>` from **silentorb-workbench** (or the thin delegator in this repo: `bun scripts/bump-version.ts`). The script scans tome and imp-ts packages for range updates and cascades on `minor`. Refresh lockfiles with `--install` or manually: `bun install` in both `.mnt/tome` and `.mnt/imp-ts` when imp packages change. Reconcile bump levels at commit time — see workbench [`plan-commit-workflow.mdc`](../../.cursor/rules/plan-commit-workflow.mdc).
