# Characters — Scene count by Product

## Summary

Dimension-expanded columns: one scene-count column per Product that appears on at least one scene linked to any character in the Characters database.

## Database

- **NotionDatabase id:** `f984a934ad644f8480b0f8f51449569f` (Characters)
- **Column key pattern:** `scene_count__{productId}`
- **Column display name pattern:** `{productTitle} Scene count`
- **Column type:** number

## Requirement

### Column discovery (view-wide)

- **Must** consider all character rows in the Characters database (all `IS_A` incoming relationships to the database).
- For each character, collect scenes via outgoing `SCENES` relationships.
- For each scene, read its outgoing `PRODUCT` relationship target (product page id).
- **Must** emit one column for each distinct product id that appears on at least one scene linked to **any** character.
- Products with no scenes linked to any character **must not** produce a column.

### Cell value (per row)

For character `C` and product `P`:

```text
scene_count__P(C) =
  |{ scene :
      (C)-[:SCENES]->(scene)
      AND (scene)-[:PRODUCT]->(P)
  }|
```

- **Must** return `"0"` when the column exists but the character has no matching scenes.
- Column keys use the full 32-hex product page id (e.g. `scene_count__e028aa0786f5449984a4f497c1d746fa`).
- Display names use the product page title (e.g. `TWOLD Scene count`).

### Replaces legacy field

Notion formula **TWOLD Scene count** (`twold_scene_count`). TWOLD becomes one generated column among all products with character-linked scenes.

## Graph paths

| Role | Pattern |
| --- | --- |
| Character row | `(character)-[:IS_A]->(Characters DB)` |
| Scene link | `(character)-[:SCENES]->(scene)` |
| Product scope | `(scene)-[:PRODUCT]->(product)` |
| Product title | `product.properties.title` |

Known product: **TWOLD** — `e028aa0786f5449984a4f497c1d746fa`

## Worked example

| Character | Page id | Product | Expected column value |
| --- | --- | --- | --- |
| James | `14f6a0f77a694f4cb18881bb58846c94` | TWOLD | `28` |

James has 113 total scenes; 28 of those scenes have `PRODUCT → TWOLD`.

## Resolver and overlay

- **resolver_id:** `characters.sceneCountByProduct`
- **Overlay params:**
  - `characters_scene_composite`: composite type for character↔scene links (e.g. `"scenes_characters"`)
  - `scene_product_composite`: composite type for scene↔product links (e.g. `"scenes_product"`)
  - `scenes_edge_label`: legacy unidirectional SCENES label (e.g. `"SCENES"`)
  - `product_edge_label`: legacy unidirectional PRODUCT label (e.g. `"PRODUCT"`)
  - `hide_legacy_keys`: column keys to hide from stored scalars (e.g. `["twold_scene_count"]`)

Registered as a **dynamic column set** in overlay table `dynamic_column_sets`.

## Verification

- Unit test: two products in corpus → two columns; character counts per product correct.
- Integration: Characters view includes `scene_count__e028aa0786f5449984a4f497c1d746fa`; James row is `28`.
