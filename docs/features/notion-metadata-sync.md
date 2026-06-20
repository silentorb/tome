# Notion metadata sync (deprecated)

## Status

**Removed.** This package synced read-only metadata from the Notion web API into the graph. The canonical store is `content/`; type-table columns live in [`content/model/table-schemas.json`](../../content/model/table-schemas.json). Edit schemas and nodes directly — see [tome-db.md](./tome-db.md) and [table-schemas.md](./table-schemas.md).

## Historical reference

The former `packages/notion-metadata-sync/` package wrote `notion_schema` and page timestamps to node frontmatter. That workflow is superseded by git-tracked workspace model files and direct content edits.
