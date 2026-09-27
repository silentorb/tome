# Compatibility (responsible prototyping)

## Summary

Tome is still in a **prototype** phase, but external projects consume its **configuration** and **canonical flat-file data storage**. Agents must treat changes to those surfaces as **compatibility-sensitive**: default to **dual-support** (new path + legacy path for a few versions), register every kept legacy path in this doc’s **Legacy registry**, and migrate workspace dependents to the new path in the same change.

This is **not** a promise of full semver stability. Package public APIs, HTTP/editor API shapes, TypeScript export names, and similar runtime/client contracts are **not** dual-supported at this stage — hard-break them and migrate workspace dependents in the same change. HTTP/package compat may return later; do not register package/HTTP legacy rows yet.

Hard-breaks on compat-sensitive surfaces remain allowed when dual-support is costly or unclear — after asking the user.

## When to read this

- Changing content-model files, project/server config, documented container/env config contracts that shape how Tome loads config/data, or canonical flat-file layout under `content/`
- Adding a dual-support shim or alternate method while keeping a legacy config/storage path
- Removing a registered legacy path
- Planning a change that would break an external consumer of config or flat-file data

## Requirements

### Decision tree

1. **Is the change compat-sensitive** (configuration or canonical flat-file storage)? If no → hard-break is OK without asking; migrate workspace dependents in the same change.
2. **If yes, is dual-support cheap and clear?** If yes → implement dual-support, register the legacy entry below, migrate workspace dependents to the **new** path.
3. **If dual-support is costly, ambiguous, or would create a long-lived fork** → ask the user before implementing. Present: dual-support / hard-break / redesign to avoid the break.

```
Interface or format change
  → compat-sensitive (config / flat-file storage)?
       no  → hard-break + migrate workspace dependents
       yes → dual-support cheap and clear?
              yes → dual-support + register legacy + migrate dependents to new path
              no / unclear → ask user (dual-support | hard-break | redesign)
```

### Compat-sensitive surfaces (dual-support applies)

- Content-model files (`schema.json`, `views.json`, `workspace.json`, `associations.json`, `table-schemas.json`, …)
- Project / server configuration files that control how Tome loads config and data
- Documented container / env config contracts that shape how Tome loads config/data
- Canonical flat-file data storage under `content/` (nodes, relationships, archive layout)
- CLI flags **only when** they change how config or data files are read or written

### Out of scope for now (hard-break OK without asking)

- Package public exports and documented TypeScript/package APIs
- HTTP / editor API shapes
- CLI flags that do not affect config/storage format contracts
- Private helpers, unexported implementation details
- Tests and test-only fixtures
- Agent-only docs (except this registry and routing pointers)

HTTP and package API compatibility may be added later; until then, do not add Legacy registry rows for those surfaces.

### Dual-support

When dual-support is chosen:

- Add the new path; keep the legacy path working for a few versions
- Prefer the new path in new code and docs
- Migrate **workspace** dependents (marloth-story, silentorb-web, translucence, and their CI) to the new path in the **same** change — dual-support is for external consumers, not for leaving internal corpora on the old path
- Add a row to the **Legacy registry** in this file
- Add tests covering both paths where practical

### Registry and removal

- Every dual-support introduction **must** add a registry row in the same change
- Do **not** silently hard-break a registered legacy path — remove only when the user asks, or as part of an agreed minor-epoch cleanup that lists the rows being dropped
- When removing: delete the legacy implementation, update dependents/tests/docs, and delete the registry row(s) in the same change

### Workspace lock-step

Workspace repos must stay mutually compatible. Propagate interface changes to every dependent corpus and its CI in the same change. See workbench `AGENTS.md` § Propagate tome breaking changes. Lock-step applies to hard-breaks as well as dual-supported migrations.

## Design rationale

External consumers of **config and flat-file corpora** need a softer landing than free hard-deletes, but scaffolding dual-support for every package or HTTP tweak would slow prototyping. Dual-support is **temporary** scaffolding with an explicit removal path (this registry), scoped to config and storage for now. Agents default to dual-support on those surfaces so the common case does not interrupt the user; they ask only when the trade-off is expensive or unclear.

Version bumps still follow 0.x rules in root [`AGENTS.md`](../../AGENTS.md): `MINOR` for breaking changes or new functionality; `PATCH` for backwards-compatible fixes.

## Legacy registry

Living table of dual-supported legacy paths.

| Id | Surface | Legacy path | Replacement | Introduced (version / commit) | Remove after | Notes |
| -- | ------- | ----------- | ----------- | ----------------------------- | ------------ | ----- |
| `sequencing-depends-association` | content-model | `sequencing.json` table fields `dependsAssociation`, `containmentAssociation` | `dependsRelationshipType`, `containmentRelationshipType` | unreleased (relationship-types rename) | TBD | Parse accepts either key (preferred wins if both present). Serialize writes preferred keys only. Workspace corpora migrated to preferred keys. |

**Column guidance**

| Column | Meaning |
| ------ | ------- |
| Id | Short stable slug (e.g. `associations-json-filename`) |
| Surface | One of: content-model, flat-file storage, project/server config, container/config, CLI (config/storage only) |
| Legacy path | What still works (file field, filename, flag, env) |
| Replacement | What callers should use instead |
| Introduced | Root or package version and/or commit when dual-support landed |
| Remove after | Target minor epoch or “TBD” until scheduled |
| Notes | Migration hints, known external callers, risks |

## Removal workflow

1. Read this registry; confirm which row(s) to drop with the user if not already specified.
2. Remove legacy code paths; update tests so they assert the new path only (and that the legacy path is gone where useful).
3. Update feature docs and any remaining references.
4. Delete the registry row(s) in this file.
5. Run full verify for tome and direct dependents (workbench `AGENTS.md` § Plan verification).

## Verification

- Dual-support changes: tests for both legacy and new paths where practical
- Removal changes: tests/docs updated; registry row removed
- Full suite: `bash scripts/run-in-tome.sh run test` (from silentorb-workbench) plus dependent corpus verifies when contracts change

## Implementation pointers

- Policy router (always-on): silentorb-workbench [`AGENTS.md`](../../../../AGENTS.md) Working conventions
- Versioning: [AGENTS.md](../../AGENTS.md) § Versioning
- Feature-doc index: [README.md](./README.md)

## See also

- Workbench propagate-breaking-changes / plan verification matrix
- [container.md](./container.md) — release / env contracts
- [web-api-design.md](./web-api-design.md) — HTTP API shape (not dual-supported at this stage)
