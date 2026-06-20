# Table views (`views.json`)

## Summary

UI-only table tab configuration for node pages lives in [`content/model/views.json`](../../content/model/views.json). It overlays the editor without changing graph data in node markdown files.

## Tab kinds

| Kind | Storage | Example |
| --- | --- | --- |
| **Custom** | Tab definitions in `views.json` (`name`, `sorts`) | Features database views |
| **Generated** | Provider id in `views.json`; tab list computed at runtime | Scenes book tabs (`scenes-by-book`) |

Both kinds render through the shared `TableTabsBar` component.

## File shape (v1)

```json
{
  "version": 1,
  "nodes": {
    "204dba198db74611b0b49a98dd53e8f5": {
      "sections": {
        "items": {
          "tabs": { "kind": "generated", "provider": "scenes-by-book" }
        }
      }
    },
    "dd0de9867cc345b898929306bdf9fc83": {
      "sections": {
        "items": {
          "tabs": {
            "kind": "custom",
            "definitions": [
              {
                "id": "prioritized",
                "name": "Prioritized",
                "sorts": [{ "column": "priority", "direction": "asc" }]
              }
            ]
          }
        }
      }
    }
  }
}
```

- **`sections.items`**: the type-table Items section (only section with tabs in v1).
- **Sort spec**: `{ column: "name" | columnKey, direction: "asc" | "desc" }`.
- **`columnOrder`** (optional): section-level override for data column order (column keys). When absent, columns use default schema order. Editable in the UI by dragging column headers.
- **Custom tab order**: implicit array order of `tabs.definitions[]`. Editable in the UI by dragging custom tab buttons (generated tabs are not reorderable).
- **Columns**: all stored scalar + relation columns from [`table-schemas.json`](./table-schemas.md), plus dynamic fields. No per-tab column visibility or filters.

## Editor behavior

- Active tab is selected via `?tab=` (standalone) or node GET `?tab=` when present; otherwise the editor restores the last tab from `.marloth/user-settings.json` (`tableTabs`).
- Custom tabs support in-editor CRUD (rename, edit sorts, add, delete) via `/api/views/nodes/:id/sections/:sectionKey/tabs`.
- Custom tab order is updated via `PATCH /api/views/nodes/:id/sections/:sectionKey` with `{ tabOrder: string[] }` (tab ids in desired order).
- Section column order is updated via `PATCH /api/views/nodes/:id/sections/:sectionKey` with `{ columnOrder: string[] }`.
- Generated tabs (Scenes) switch scope only; no CRUD chrome.

## Migration

Legacy Notion view tabs were migrated with:

```bash
bun scripts/migrate-notion-views-to-views-json.ts
```

Filtered Notion views were dropped (Features → Unresolved, Solutions → Incomplete). `notion_views` was removed from node frontmatter; `notion_schema` remains for column typing.

## Code

| Area | Path |
| --- | --- |
| File format | `packages/tome-db/src/content/views-file.ts` |
| Resolution | `packages/tome-db/src/views/resolve-tabs.ts` |
| Mutations | `packages/tome-db/src/views/mutations.ts` |
| UI | `packages/tome-editor/src/webview/components/TableTabsBar.tsx` |
