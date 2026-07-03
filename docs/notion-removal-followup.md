# Notion removal — follow-up plan (phase 2+)

## Status

**Phase 1 is complete.** It removed the safe, behavior-neutral Notion references from tome:

- Deleted the legacy `notion-import.md` and `notion-metadata-sync.md` feature docs and fixed all inbound links (tome, workbench root, marloth-story).
- Renamed the audit helper `notionPathFromSourceExport` → `pathFromSourceExport` and neutralized its comments.
- Removed dead migration-script mentions from `table-schemas.md` and `views.md`.
- Reworded "Notion-like" analogies and dynamic-field provenance wording.

**Phase 2 (Categories 2, 3, 4, 6 + tome legacy-importer doc references) is complete.** These crossed the "runtime code / stored contract / cross-repo" line, so they were done together with tests and the required dependent-repo update. See "Completed in phase 2" below. The only remaining work is the **broader marloth-story cleanup** (a companion effort, tracked at the end of this doc).

Guiding rule for phase 1 (for reference): remove Notion as a *product / tool / origin* in prose, comments, analogies, and non-runtime tooling names; leave literal stored keys and runtime link/id/archive functions working. Phase 2 completed the identifier renames while preserving that runtime behavior.

## Completed in phase 2

Behavior was preserved throughout; Categories 2, 3, 6 were pure renames and Category 4 in tome was dead-fixture removal + doc rewording (tome source no longer reads these keys).

- **Category 2 — 32-hex node-id normalization.** Renamed `packages/tome-db/src/notion-ids.ts` → [`hex-ids.ts`](../packages/tome-db/src/hex-ids.ts); `isNotionHexId` → `isHex32Id`, `normalizeNotionId` → `normalizeHex32Id`. Updated the [`index.ts`](../packages/tome-db/src/index.ts) re-export and renamed the test to `packages/tome-db/tests/hex-ids.test.ts`.
- **Category 3 — legacy link / export-path resolution.** Renamed `NOTION_PAREN_LINK` → `LEGACY_PAREN_LINK` in [`markdown-links.ts`](../packages/tome-db/src/markdown-links.ts) (resolution behavior unchanged); reworded legacy export-path wording in `static-website.md`, `tome-editor.md`, and five test titles.
- **Category 4 — data-model keys and node-type labels.** Removed the vestigial `notion_schema` / `notion_id` blocks from tome test fixtures (they were no longer read: `isTypeTableNode` uses `table-schemas.json` + incoming `is_a`); reworded `NotionPage` / `NotionDatabase` wording in tests and docs; neutralized `relation-type.ts` comments. The `validate:content-model` guard **still rejects `notion_*` / `source_export` frontmatter keys** as a permanent tombstone (intentionally unchanged; lives in `repos/marloth-story/scripts/validate-content-model.ts`).
- **Category 6 — archive-path detection.** Renamed `isLegacyArchivedNotionPath` → `isLegacyArchivedPath` in [`archive-status.ts`](../packages/tome-db/src/archive-status.ts), the [`index.ts`](../packages/tome-db/src/index.ts) re-export, and the test; reworded `graph-explorer.md`.
- **Legacy-importer references in tome docs.** Dropped the archived-importer mentions from `tome-db.md` (`notion:import`, `notion-import-manifest.json`, `notion-link-report.txt`, `packages/_archive/notion-importer/...`) and `packages/tome-db/AGENTS.md` (`notion:import` / `--clean`). The importer lives in `repos/marloth-story/packages/_archive/notion-importer`, not tome.
- **Cross-repo consumer (required).** Updated `repos/marloth-story/scripts/migrate-archive-to-includes.ts` and `repos/marloth-story/docs/refactoring/01-workspace-json.md` to the renamed `isLegacyArchivedPath` export.

After phase 2, `rg -i notion repos/tome` matches only this tracking doc and the intentional `notion_*` tombstone line in `tome-db.md`.

## Broader marloth-story cleanup (remaining companion effort)

Out of scope for tome and intentionally deferred, but required for a truly Notion-free workspace:

- `repos/marloth-story/docs/ontology.md` — `NotionPage` / `NotionDatabase` row, "Notion export quirks", "Historical mapping" wording.
- `repos/marloth-story/docs/refactoring/00-overview.md` (line 79), `04-dynamic-fields-and-audit.md` — Notion export path assumptions.
- `repos/marloth-story/packages/_archive/legacy-notion-schema.ts` — `NotionDatabaseSchema` / `parseNotionSchema` etc., imported by several `scripts/`.
- `repos/marloth-story/packages/_archive/notion-importer/` — archived importer + its `AGENTS.md` (still links to the removed tome `notion-import.md`; already a broken link).
- `repos/marloth-story/scripts/` — `migrate-notion-schema-to-table-schemas.ts` (its `../packages/tome-db/src/notion-ids` import is already dead — that path does not exist in marloth-story), `strip-notion-provenance.ts`, `migrate-notion-views-to-views-json.ts`, `strip-inferred-notion-path.ts`, `deprecated-notion-import.ts` (all one-time / already run — candidates for deletion).
- `repos/marloth-story/AGENTS.md` — remaining `notion:import` mining references.

## Verification (for the remaining marloth-story cleanup)

- `bash scripts/run-in-tome.sh bun test`
- `bash scripts/build-static-site.sh` (marloth) and `bash scripts/build-silentorb-web.sh` (silentorb-web) for any change that touches shared keys/labels.
- `rg -i notion repos/marloth-story` should shrink toward zero as the cleanup completes.
