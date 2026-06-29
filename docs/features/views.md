# Table views (`views.json`)

## Summary

Table view configuration for type-table member relationships lives in [`content/model/views.json`](../../content/model/views.json). It defines how rows are sorted and presented without changing graph data in node markdown files.

## View records (v2)

```json
{
  "version": 2,
  "views": [
    {
      "id": "weighted",
      "nodeId": "2eea538996934ce8abafc27132e576c1",
      "relationshipType": "members",
      "name": "Weighted",
      "sorts": [{ "column": "weighted_use", "direction": "desc" }],
      "properties": { "columnOrder": ["type", "features", "weighted_use"] }
    },
    {
      "nodeId": "204dba198db74611b0b49a98dd53e8f5",
      "relationshipType": "members",
      "generator": "scenes-by-book"
    }
  ]
}
```

- **`relationshipType`**: graph relationship from the set node (usually `"members"`).
- **Custom views**: require `id`, `name`, `sorts` (array, may be empty).
- **Generated views**: use `generator` (e.g. `scenes-by-book`); computed at runtime from ordered-associations config.
- **`properties.columnOrder`**: optional column key order, duplicated on each view for the same `(nodeId, relationshipType)` pair.
- **`hiddenColumns`**: optional column keys hidden in that view only (not synced across sibling views).
- **Tab order**: array order of views sharing the same pair; the UI derives tabs when more than one view exists.

## Editor behavior

- Active tab is selected via `?tab=` (standalone) or node GET `?tab=` when present; otherwise the editor restores the last tab from `.marloth/user-settings.json` (`tableTabs`).
- Custom views support in-editor CRUD via `/api/views/nodes/:id/relationships/:relationshipType/views`.
- View order is updated via `PATCH /api/views/nodes/:id/relationships/:relationshipType` with `{ viewOrder: string[] }`.
- Column order is updated via the same PATCH with `{ properties: { columnOrder: string[] } }` (syncs all sibling views).
- Column visibility is updated per view via `PATCH .../views/:viewId` with `{ hiddenColumns: string[] }`.
- Generated views (Scenes) switch scope only; no CRUD chrome.

## Migration

Legacy v1 nested format was migrated with:

```bash
bun scripts/migrate-views-json-v2.ts
```

Earlier Notion view tabs were migrated with `bun scripts/migrate-notion-views-to-views-json.ts` (deprecated).

## Code

| Area | Path |
| --- | --- |
| File format | `packages/tome-db/src/content/views-file.ts` |
| Index / lookup | `packages/tome-db/src/views/index.ts` |
| Resolution | `packages/tome-db/src/views/resolve-tabs.ts` |
| Mutations | `packages/tome-db/src/views/mutations.ts` |
| UI | `packages/tome-editor/src/webview/components/TableUtilityBar.tsx` |
