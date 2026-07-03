# Notion removal — follow-up plan (phase 2+)

## Status

**Phase 1 is complete.** It removed the safe, behavior-neutral Notion references from tome:

- Deleted the legacy `notion-import.md` and `notion-metadata-sync.md` feature docs and fixed all inbound links (tome, workbench root, marloth-story).
- Renamed the audit helper `notionPathFromSourceExport` → `pathFromSourceExport` and neutralized its comments.
- Removed dead migration-script mentions from `table-schemas.md` and `views.md`.
- Reworded "Notion-like" analogies and dynamic-field provenance wording.

**This document tracks what was intentionally deferred** because it is either live runtime code, a stored data-model contract, or a cross-repo migration. None of these can be renamed without preserving behavior and propagating to dependent repos (see the root [`AGENTS.md`](../../../AGENTS.md) "propagate tome breaking changes" convention).

Guiding rule for phase 1 (for reference): remove Notion as a *product / tool / origin* in prose, comments, analogies, and non-runtime tooling names; leave literal stored keys and runtime link/id/archive functions working. The remaining work below crosses that line, so it needs its own change(s) with tests and dependent-repo updates.

## Key facts that de-risk this work

- The marloth-story corpus **content already carries zero `notion_id` / `notion_schema` / `notion_database` frontmatter keys** (verified: 0 matching files under `repos/marloth-story/content/`). The data-model migration off these keys is effectively done at the data layer; remaining references are in **tome test fixtures, docs, and a `validate:content-model` guard**, plus **marloth-story scripts**.
- Node ids are 32-hex strings (historically Notion page ids) and are still the stable node identity. Category 2 is a **pure rename**, not a behavior change.
- `normalizeNotionId` is exported from `tome-db` and consumed by `repos/marloth-story/scripts/migrate-notion-schema-to-table-schemas.ts`, so renaming it is a cross-repo change (or that already-run one-time script can be removed as part of marloth-story cleanup).

## Category 2 — 32-hex node-id normalization (pure rename)

Preserve behavior; rename identifiers only.

- [`packages/tome-db/src/notion-ids.ts`](../packages/tome-db/src/notion-ids.ts) — `isNotionHexId`, `normalizeNotionId`, `HEX32`. Suggested names: `isHex32Id`, `normalizeHex32Id`. Consider renaming the file to `hex-ids.ts`.
- [`packages/tome-db/src/index.ts`](../packages/tome-db/src/index.ts) line 62 re-export.
- [`packages/tome-db/tests/notion-ids.test.ts`](../packages/tome-db/tests/notion-ids.test.ts) — rename file + imports.
- Cross-repo consumer: `repos/marloth-story/scripts/migrate-notion-schema-to-table-schemas.ts` imports `normalizeNotionId` — update or delete (one-time script, already run).

## Category 3 — legacy link / export-path resolution (live runtime)

Keep the resolution working (existing content still contains legacy link forms); rename identifiers/wording only.

- [`packages/tome-db/src/markdown-links.ts`](../packages/tome-db/src/markdown-links.ts) — `NOTION_PAREN_LINK` regex (lines 17, 177, 179). Suggested name: `PAREN_LINK` or `LEGACY_PAREN_LINK`.
- Docs describing legacy export-path rewriting:
  - [`docs/features/static-website.md`](./features/static-website.md) line 19 (`legacy Notion {32-hex}.md paths`).
  - [`docs/features/tome-editor.md`](./features/tome-editor.md) lines 58, 63 (legacy Notion export links resolve at read time).
- Tests referencing legacy export paths / paren links:
  - `packages/tome-db/tests/markdown-links.test.ts` (line 122)
  - `packages/tome-editor/tests/shared/types.test.ts` (line 29)
  - `packages/tome-editor/tests/webview/node-links.test.ts` (line 17)
  - `packages/tome-editor/tests/webview/standalone-markdown.test.ts` (line 34)
  - `packages/tome-static-site/tests/markdown.test.ts` (line 59)

## Category 4 — data-model keys and node-type labels (contract + cross-repo)

`notion_schema`, `notion_id`, `notion_database`, and the `NotionPage` / `NotionDatabase` node-type labels. Content no longer stores these keys, so the tome surface is test fixtures, docs, and a guard — but a rename must stay consistent across all of them and dependents.

- `relation-type.ts` comments (lines 2, 31) — "Maps Notion database property names …".
- Docs still using these tokens: [`docs/features/dynamic-table-fields.md`](./features/dynamic-table-fields.md) line 22; [`docs/features/table-schemas.md`](./features/table-schemas.md) lines 11, 41; [`docs/features/tome-editor.md`](./features/tome-editor.md) lines 27, 29, 38, 104, 108; [`docs/features/ordered-associations.md`](./features/ordered-associations.md) line 47; [`packages/tome-db/AGENTS.md`](../packages/tome-db/AGENTS.md) line 14; [`docs/features/tome-db.md`](./features/tome-db.md) lines 25, 27, 202 (`notion_*` guard).
- Test fixtures using `notion_schema` / `NotionDatabase` / `notion_id`:
  - `packages/tome-db/tests/database-view-relations.test.ts` (line 69)
  - `packages/tome-db/tests/node-page-sections.test.ts` (lines 104, 137, 188, 219, 238)
  - `packages/tome-db/tests/node-type-properties.test.ts` (line 59)
  - `packages/tome-db/tests/content/schema-enum-sync.test.ts` (line 51)
  - `packages/tome-db/tests/content/content.test.ts` (line 26)
- `validate:content-model` guard rejects legacy `notion_*` frontmatter keys (see `tome-db.md` line 202 and `repos/marloth-story/scripts/validate-content-model.ts`). Decide whether the guard keeps rejecting `notion_*` (recommended, as a permanent tombstone) or is renamed.
- **Cross-repo:** verify `repos/silentorb-web` and `repos/marloth-story` consume no renamed key/label before changing anything; rebuild both (`bash scripts/build-static-site.sh`, `bash scripts/build-silentorb-web.sh`).

## Category 6 — archive-path detection (live runtime)

- [`packages/tome-db/src/archive-status.ts`](../packages/tome-db/src/archive-status.ts) — `isLegacyArchivedNotionPath`. Suggested name: `isLegacyArchivedPath`.
- [`packages/tome-db/src/index.ts`](../packages/tome-db/src/index.ts) line 5 re-export.
- [`packages/tome-db/tests/archive-status.test.ts`](../packages/tome-db/tests/archive-status.test.ts) — imports + test names.
- [`docs/features/graph-explorer.md`](./features/graph-explorer.md) line 24 ("archived Notion paths (`Marloth/Archive` …)").

## Legacy-importer references remaining in tome docs

`tome-db.md` still describes the archived importer (which lives in `repos/marloth-story/packages/_archive/notion-importer`, not tome):

- [`docs/features/tome-db.md`](./features/tome-db.md) lines 40, 42, 119, 176, 177, 203, 222 (`packages/notion-importer`, `notion:import`, Notion `.md`/`.csv` mining, `notion-import-manifest.json`, `notion-link-report.txt`, `packages/_archive/notion-importer/...`).
- [`packages/tome-db/AGENTS.md`](../packages/tome-db/AGENTS.md) line 29 (`notion:import` / `--clean`).

Decide whether tome docs should describe the marloth-story-owned importer at all, or drop these mentions entirely (the importer is not in the tome repo).

## Broader marloth-story cleanup (companion effort)

Out of scope for tome, but required for a truly Notion-free workspace:

- `repos/marloth-story/docs/ontology.md` — `NotionPage` / `NotionDatabase` row, "Notion export quirks", "Historical mapping" wording.
- `repos/marloth-story/docs/refactoring/00-overview.md` (line 79), `04-dynamic-fields-and-audit.md` — Notion export path assumptions.
- `repos/marloth-story/packages/_archive/legacy-notion-schema.ts` — `NotionDatabaseSchema` / `parseNotionSchema` etc., imported by several `scripts/`.
- `repos/marloth-story/packages/_archive/notion-importer/` — archived importer + its `AGENTS.md` (still links to the removed tome `notion-import.md`; already a broken link).
- `repos/marloth-story/scripts/` — `migrate-notion-schema-to-table-schemas.ts`, `strip-notion-provenance.ts`, `migrate-notion-views-to-views-json.ts`, `strip-inferred-notion-path.ts`, `deprecated-notion-import.ts` (all one-time / already run — candidates for deletion).
- `repos/marloth-story/AGENTS.md` — remaining `notion:import` mining references.

## Suggested sequencing

1. Categories 2 and 6 first (isolated pure renames in tome-db + tests + one marloth-story script).
2. Category 3 (rename regex/wording; keep resolution behavior; update the five test suites).
3. Category 4 (coordinated rename across tome tests/docs/guard + marloth-story + silentorb-web) — largest blast radius; do last with full builds of all dependents.
4. Legacy-importer doc references + broader marloth-story cleanup alongside category 4.

## Verification (each phase)

- `bash scripts/run-in-tome.sh bun test`
- `bash scripts/build-static-site.sh` (marloth) and `bash scripts/build-silentorb-web.sh` (silentorb-web) for any category that touches shared keys/labels.
- `rg -i notion repos/tome` should shrink to zero as categories complete.
