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
      "association": "01KXBNPNJDENZ9BXN5BYZ7JKPT",
      "name": "Weighted",
      "sorts": [{ "column": "weighted_use", "direction": "desc" }],
      "properties": ["type", "features", "weighted_use"]
    },
    {
      "nodeId": "204dba198db74611b0b49a98dd53e8f5",
      "association": "01KXBNPNJDENZ9BXN5BYZ7JKPT",
      "generator": "scenes-by-book",
      "properties": ["parents", "children", "scenes"]
    }
  ]
}
```

- **`association`**: set-trait association ULID from `associations.json` (not a display label).
- **Custom views**: require `id`, `name`, `sorts` (array, may be empty).
- **Generated views**: use `generator` (e.g. `scenes-by-book`); computed at runtime from ordered-collections config.
- **`properties`**: optional string array of visible column keys in display order (additive allowlist).
  - Absent → all columns visible, default order.
  - Present → only listed keys are visible, in listed order (unknown keys ignored; missing keys are not appended).
  - **Custom views:** per-view (not synced across sibling tabs). Reorder, visibility toggles, and UI column-add update the active view only.
  - **Generated views:** shared on the single generated record for all tabs produced by that generator.
- **Tab order**: array order of views sharing the same pair; the UI derives tabs when more than one view exists.

## Editor behavior

- Active tab is selected via `?tab=` (standalone) or node GET `?tab=` when present; otherwise the editor restores the last tab from `.marloth/user-settings.json` (`tableTabs`).
- Custom views support in-editor CRUD via `/api/views/nodes/:id/associations/:associationId/views`.
- View order is updated via `PATCH /api/views/nodes/:id/associations/:associationId` with `{ viewOrder: string[] }`.
- Column order and visibility for a custom view are updated via `PATCH .../views/:viewId` with `{ properties: string[] }`.
- Shared properties for a generated association are updated via `PATCH .../associations/:associationId` with `{ properties: string[] }`.
- Adding a stored column via the UI passes `viewId` so the new key is appended only to the active custom view’s `properties` (when that allowlist already exists). Sibling custom views are unchanged.
- Generated views (Scenes) switch scope only; no CRUD chrome.

## Lazy-loaded rows (infinite scroll)

Multi-row Items tables **must not** block page load on the full member set. The editor requests rows in batches (default **`limit=50`**) with **`offset`**, optional name filter **`q`**, and optional **`sorts`** JSON. There is **no paging UI** (no page numbers): the client appends the next batch when the user scrolls the **page shell** (`.tome-main`) near the table sentinel—not an inner table scroll box. Tables size to their loaded rows (natural page height).

- Responses include `rowsWindow: { offset, limit, total, hasMore }` on `DatabaseViewDetail`, `OrderedCollectionViewDetail`, and `RelationTableSection`.
- Name filter and column sorts are applied **server-side** before slicing. Relation-cell hydration runs for the returned window only (dynamic columns still evaluate over the full set when needed for sort correctness).
- Endpoints: `GET /api/databases/:id`, `GET /api/ordered-collections/:configId`, `GET /api/nodes/:id/relation-tables/:perspective`, and the multi-row sections embedded in `GET /api/nodes/:id` (editor default limit). Omit `limit` for a full result (static site export).

## Migration

Legacy v1 nested format was migrated with:

```bash
bun scripts/migrate-views-json-v2.ts
```

## Code

| Area | Path |
| --- | --- |
| File format | `packages/tome-db/src/content/views-file.ts` |
| Index / lookup | `packages/tome-db/src/views/index.ts` |
| Resolution | `packages/tome-db/src/views/resolve-tabs.ts` |
| Mutations | `packages/tome-db/src/views/mutations.ts` |
| UI | `packages/tome-editor/src/webview/components/TableUtilityBar.tsx` |
