# Dynamic properties

## Summary

**Dynamic properties** are type-table view columns computed at read time from graph traversals. Logic is documented authoritatively in [`docs/dynamic-properties/`](../dynamic-properties/); runtime bindings live in `content/model/dynamic-properties.json` and are loaded into memory at read time (legacy SQLite `dynamic_*` overlay tables were removed in schema v4).

## When to read this

Read this doc when your task involves:
- Computed/formula/rollup columns in type-table views
- `content/model/dynamic-properties.json` bindings
- `packages/tome-db/src/dynamic-properties/`
- Adding or changing dynamic property resolvers

For per-property logic, read the spec in [`docs/dynamic-properties/`](../dynamic-properties/README.md). For graph storage, read [tome-db.md](./tome-db.md). For editor table rendering, read [tome-editor.md](./tome-editor.md).

## Requirements

### Core model

- Dynamic values **must** be computed in `tome-db` when building `DatabaseViewDetail`, before view filter/sort evaluation.
- Dynamic values **must** override stale `IS_A` relationship properties when column keys match.
- Core graph files **must not** store dynamic property configuration; `dynamic-properties.json` only.
- Each dynamic property **must** have an authoritative spec under `docs/dynamic-properties/`. Spec path is convention: `docs/dynamic-properties/<resolverId kebab>.md` (not stored in bindings).
- Resolvers **must** be registered in TypeScript (`resolverId` → function); binding rows reference resolver ids and params only.
- Property and column-set entry `id` values **must** be ULIDs.

### Configuration file

- Bindings **must** live in `content/model/dynamic-properties.json` (`properties[]` and `columnSets[]`).
- Each entry uses `owner` (type-table / set node id the property belongs to).
- Seed starter bindings: `bun scripts/seed-dynamic-properties.ts`.

### Params contract

Resolver **algorithms** live in TypeScript; `params` in `dynamic-properties.json` supply workspace-specific graph vocabulary only (composite type names, edge labels, anchor node ids). Resolvers **must not** default to workspace-specific composite or edge strings when a param is omitted — empty param means skip that traversal path.

Params are an informal per-resolver key bag (not a shared schema). Keys that scope membership to a type table use `*_table_id` (table terminology at the resolver/SQL-adjacent layer). Binding-level identity uses `owner`.

| `resolverId` | Param keys | Purpose |
| --- | --- | --- |
| `characters.allSceneCount` | `characters_scene_composite`, `scenes_edge_label`, `scenes_table_id` | Composite character↔scene links; scoped includes to Scenes table; legacy SCENES edges |
| `characters.sceneCountByProduct` | `characters_scene_composite`, `scene_product_composite`, `scenes_edge_label`, `product_edge_label`, `scenes_table_id`, `products_table_id`, `hide_legacy_keys` | Scene/product traversals scoped to Scenes/Products members; hide stale stored columns |
| `inspirations.weightedUse` | `inspiration_feature_composite`, `features_edge_label`, `features_table_id` | Feature links; Features table for priority weights |
| `inspirations.wonder` | `inspiration_feature_composite`, `features_edge_label`, `theme_edge_label`, `theme_target_id` | Feature links; theme anchor for wonder count |

Per-property semantics and worked examples: [`docs/dynamic-properties/`](../dynamic-properties/README.md).

### Column kinds

| Kind | JSON section | Behavior |
| --- | --- | --- |
| Fixed | `properties` | One column key per property (e.g. `all_scene_count`) |
| Dimension-expanded | `columnSets` | Pattern generates columns per dimension value (e.g. per Product) |

### Editor integration

- Dynamic properties **must** appear in **database table views** (`DatabaseTableView` / `getDatabaseViewDetail`) and on instance-page **Properties** sections (`buildPropertiesSection` / `PropertiesSectionView`).
- On Properties sections, dynamic values are **read-only**; stored scalars remain editable via the existing database row property API.
- Instance-page Properties use `applyDynamicProperties` with all overlay-bound properties for the type table (view-tab bindings ignored).
- Relation table sections **may** gain dynamic columns in a future version.
- `DatabaseColumnDef` **may** include `source: 'dynamic'` for read-only UI styling.

### Agent workflow

1. Write/update `docs/dynamic-properties/<resolverId kebab>.md`.
2. Implement resolver in `packages/tome-db/src/dynamic-properties/resolvers/`.
3. Register resolver id in `registry.ts` / starter registration.
4. Update bindings in `content/model/dynamic-properties.json` (or `bun scripts/seed-dynamic-properties.ts`).
5. Add tests in `packages/tome-db/src/dynamic-properties/`.
6. Run graph migration scripts if new relationships are required (e.g. `scripts/migrate-theme-edges.ts`).

No manual UI for property configuration in v1.

## Design rationale

### Docs as source of truth

Agents implement and reimplement resolvers from property specs. Overlay config is bindings only; semantics live in docs. Spec location is derived from `resolverId`, not a config `docsPath`.

### Overlay vs core graph

Separating configuration lets the overlay be rebuilt without touching imported design data. Theme associations (e.g. `THEME → Wonderland`) live in core relationships because they are design relationships, not property config.

### Hybrid execution

Pure config DSLs are insufficient for graph traversals and dimension expansion. TypeScript resolvers provide power; overlay bindings avoid hard-coding owner/column bindings in code.

## Behavior / pipeline

```
getDatabaseViewDetail(db, databaseId, view)
  → build EvalRow[] from IS_A relationships
  → applyDynamicProperties(db, owner, viewName, evalRows)
       load overlay rows for owner
       expand columnSets → concrete columns
       batch prefetch graph data
       invoke resolvers → merge cells
  → sortEvalRowsFromViewSorts (views.json tab sorts)
  → build columnDefs (inject dynamic defs; dynamic wins over stored)
  → DatabaseViewDetail
```

## Inputs / outputs / artifacts

| Path | Role |
| --- | --- |
| `docs/dynamic-properties/*.md` | Authoritative property logic |
| `content/model/dynamic-properties.json` | Runtime bindings |
| `packages/tome-db/src/dynamic-properties/` | Resolver registry and enrichment |
| `scripts/seed-dynamic-properties.ts` | Write starter bindings to content |
| `scripts/migrate-theme-edges.ts` | Create THEME relationships from legacy tags |

## Quick start

```bash
# Migrate theme relationships (core graph, one-time)
bun run scripts/migrate-theme-edges.ts

# Seed overlay configuration
bun run scripts/seed-dynamic-properties.ts

# Run tests
cd packages/tome-db && bun test tests/dynamic-properties
```

## Verification

- `bun test` in `packages/tome-db` — dynamic-properties unit and integration tests
- Open Characters type table in editor — `all_scene_count` and per-product columns populated
- Open Inspirations type table — `weighted_use` and `wonder` match doc examples

## Implementation pointers

| Component | Path |
| --- | --- |
| Schema / overlay DDL | `packages/tome-sqlite/src/schema.ts` |
| Overlay read API | `packages/tome-db/src/dynamic-properties/overlay.ts` |
| Enrichment hook | `packages/tome-db/src/dynamic-properties/enrich.ts` |
| View integration | `packages/tome-db/src/database-view.ts` |
| Resolvers | `packages/tome-db/src/dynamic-properties/resolvers/` |

## See also

- [Dynamic property specs index](../dynamic-properties/README.md)
- [tome-db.md](./tome-db.md)
- [tome-editor.md](./tome-editor.md)
