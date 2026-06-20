# Table schemas (`table-schemas.json`)

## Summary

Type-table column definitions live in [`content/model/table-schemas.json`](../../content/model/table-schemas.json). Each entry is keyed by the **type-table node id** (32-hex). The editor and `tome-db` table views read columns from this file—not from node frontmatter.

## When to read this

- Adding or editing database table columns (select, relation, checkbox, etc.)
- Understanding how `is_a` row properties map to UI columns
- Migrating or auditing type tables after the Notion schema migration

See also [tome-db.md](./tome-db.md), [views.md](./views.md), and [schema.md](./schema.md).

## File shape (v1)

```json
{
  "version": 1,
  "tables": {
    "dd0de9867cc345b898929306bdf9fc83": {
      "columns": [
        { "key": "priority", "name": "Priority", "type": "select", "enumId": "priority" },
        {
          "key": "inspirations",
          "name": "Inspirations",
          "type": "relation",
          "targetTypeId": "2eea538996934ce8abafc27132e576c1",
          "perspective": "inspirations"
        }
      ]
    }
  }
}
```

## Column rules

| Rule | Detail |
| --- | --- |
| **Identity** | Column identity is `key` (slug), not Notion property ids |
| **Scalars** | `select`, `multi_select`, `checkbox`, `number`, `text`, `date`, `url`, `email`, `phone_number` |
| **Relations** | `targetTypeId` is a graph node id; `perspective` maps to [`relationship-types.json`](../../content/model/relationship-types.json) |
| **Enums** | `enumId` references [`schema.json`](../../content/model/schema.json) `enums` |
| **Computed** | Formula/rollup columns are **not** stored here; use [`dynamic-fields.json`](./dynamic-table-fields.md) |

### Editable `select` / `status` columns

`select` and `status` columns are stored on `is_a` relationship properties like other scalars, but the editor only renders **editable enum dropdowns** when the column is wired into the workspace enum system:

1. Define the option list under `schema.json` → `enums` (e.g. shared `yes_no` for `True` / `False`).
2. Set `enumId` on the column in `table-schemas.json` (the column `key` and enum id may differ — e.g. `plot_is_driven_by_mc_desire` → `yes_no`).

`tome-db` promotes wired columns to `type: "enum"` with `options` for the UI (`EnumSelectCell`). Bare `select` / `status` columns without a resolvable `enumId` display as **read-only badges**.

Priority is the reference pattern: `enumId: "priority"` plus `schema.json` → `enums.priority`.

**Backfill:** one-time script `bun scripts/seed-select-enums.ts` derives enums from distinct stored values on `is_a` edges and writes `enumId` links (supports `--dry-run`).

## Type table detection

A node is a **type table** when:

1. Its id appears in `table-schemas.json`, **or**
2. It has incoming `is_a` edges (legacy heuristic for tables without explicit schema entries)

Row data for instances is stored on `is_a` relationship properties, not on the instance node vertex.

## Editing

- **Editor UI:** type-table Items sections support **add**, **edit**, **delete**, and **reorder** for stored columns (`table-schemas.json`). Use **+ Column** in the table utility bar or right-click anywhere in a column header cell → **Edit** / **Delete**. Dynamic/computed columns (`dynamic-fields.json`) remain read-only in the UI.
- **Create / update API:** `POST /api/databases/:id/columns`, `PATCH /api/databases/:id/columns/:key` (see [tome-editor.md](./tome-editor.md)).
- **Destructive schema edits** (key rename, type change, relation target/perspective change) migrate or clear row data on `is_a` edges; the UI confirms before applying.
- **`select` / `status`:** the editor can wire an **existing** `schema.json` enum via `enumId`. Creating new enum definitions remains a manual / script workflow (`bun scripts/seed-select-enums.ts`, edit `schema.json`).
- **Manual:** edit `table-schemas.json` directly (validate with `bun run validate:content-model`)
- **Sync:** `bun run content:sync` or editor API startup rebuilds the SQLite cache

## Migration

One-time migration from `notion_schema` frontmatter: `bun scripts/migrate-notion-schema-to-table-schemas.ts` (already run on the corpus). Legacy provenance keys are stripped by `bun scripts/strip-notion-provenance.ts`.

Select/status enum backfill (post-migration): `bun scripts/seed-select-enums.ts` — adds `schema.json` enums and `table-schemas.json` `enumId` for columns that were imported without workspace enum wiring.
