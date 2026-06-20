# Feature documentation

Everything under `./docs` is **primarily for AI agents** — stable, high-level workspace knowledge so agents need not re-analyze the repo for basics on every task. Docs should remain **easy for humans to read and edit** when needed.

The **[design ontology](../ontology.md)** (`docs/ontology.md`) describes the creative/design domain model in human terms. **Project feature** specs in this directory describe workspace tooling. Agents working with graph data should use **both** the ontology and schema-specific feature docs.

Each file in this directory is the **authoritative design spec** for one major workspace feature. A feature doc should:

1. **Streamline agent onboarding** — enough context to orient quickly without spelunking `packages/` or `content/`.
2. **State design requirements** — explicit rules (inputs, outputs, invariants, formats). Prefer must / should / may language; requirements trump implementation when they diverge.
3. **Capture design rationale** — motivation and trade-offs so future changes stay aligned with intent.
4. **Support limited regeneration** — behavior, data shapes, and pipeline stages described clearly enough that implementation *could* be rewritten from the doc alone (vision, not a hard guarantee).

## Registered features

| Feature | Doc |
| --- | --- |
| SQLite property graph (`data/`) | [tome-db.md](./tome-db.md) |
| Notion export → graph import (**legacy**) | [notion-import.md](./notion-import.md) |
| Type table columns (`table-schemas.json`) | [table-schemas.md](./table-schemas.md) |
| Notion API metadata sync (**removed**) | [notion-metadata-sync.md](./notion-metadata-sync.md) |
| Web markdown editor (browser + graph API) | [tome-editor.md](./tome-editor.md) |
| Graph Explorer (LOD graph visualization) | [graph-explorer.md](./graph-explorer.md) |
| Ordered associations (scene order, DnD) | [ordered-associations.md](./ordered-associations.md) |
| Dynamic table fields (computed columns) | [dynamic-table-fields.md](./dynamic-table-fields.md) |
| Table view tabs (`views.json`) | [views.md](./views.md) |
| Static website generation (Astro) | [static-website.md](./static-website.md) |
| Static website deploy (GitHub Actions → S3/CloudFront) | [static-website-deploy.md](./static-website-deploy.md) |
| Relationship schema rules | [schema.md](./schema.md) |

## Split of concerns

- **Feature doc** (`docs/features/`) — *what* and *why* (requirements, rationale, regen-friendly behavior).
- **Package `AGENTS.md`** — *how to work in this package* (run, test, config flags, file layout).
- **Root `AGENTS.md`** — always-on router + repo-wide conventions; not a feature spec.

## Adding a new feature doc

1. Create `docs/features/<name>.md` using the template below.
2. Add a routing row to the **Feature documentation** table in root [`AGENTS.md`](../../AGENTS.md).
3. Add an entry to the table above in this README.
4. Link from the package `AGENTS.md` if the feature has a `packages/` implementation.
5. Optionally add a thin [`.cursor/rules/<name>.mdc`](../../.cursor/rules/) pointer (globs + link to the feature doc; no duplicated spec).

## Feature doc template

Copy this skeleton when authoring a new feature:

```markdown
# <Feature name>

## Summary

## When to read this

## Requirements

## Design rationale

## Behavior / pipeline

## Inputs / outputs / artifacts

## Quick start

## Configuration

## Verification

## Implementation pointers

## See also
```
