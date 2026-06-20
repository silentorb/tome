# Inspirations — Wonder

## Summary

Count of linked Features that are associated with the Wonderland theme page.

## Database

- **NotionDatabase id:** `2eea538996934ce8abafc27132e576c1` (Inspirations)
- **Column key:** `wonder`
- **Column display name:** Wonder
- **Column type:** number

## Requirement

For each inspiration row:

1. Follow outgoing `FEATURES` relationships to feature pages.
2. **Must** count features that have an outgoing `THEME` relationship to the Wonderland page.
3. **Must** return the count as a decimal string.

```text
wonder(inspiration) =
  |{ feature :
      (inspiration)-[:FEATURES]->(feature)
      AND (feature)-[:THEME]->(Wonderland page)
  }|
```

This replaces the Notion rollup chain that summed Features **Wonderland count** (itself a workaround for a `Wonderland` tag).

## Graph paths

| Role | Pattern |
| --- | --- |
| Inspiration row | `(inspiration)-[:IS_A]->(Inspirations DB)` |
| Feature link | `(inspiration)-[:FEATURES]->(feature)` |
| Theme association | `(feature)-[:THEME]->(Wonderland page)` |
| Wonderland page id | `3cbc40d2ba2a4c76b4b9dc370452fcfe` |
| Wonderland path | `Marloth/Articles/Wonderland` |

Theme relationships are created by `scripts/migrate-theme-edges.ts` from legacy `prop_tags` / `wonderland_count` on Features rows.

## Replaces legacy field

- Inspirations Notion rollup **Wonder** (`wonder` on `IS_A` relationship properties)
- Features workaround **Wonderland count** (`wonderland_count`) — no longer needed for this calculation

## Worked example

| Inspiration | Expected |
| --- | --- |
| Big Trouble in Little China | `7` |

Seven linked features have `THEME → Wonderland` after theme-relationship migration.

## Resolver and overlay

- **resolver_id:** `inspirations.wonder`
- **Overlay params:**
  - `inspiration_feature_composite`: composite type for inspiration↔feature links (e.g. `"inspirations_features"`)
  - `features_edge_label`: legacy unidirectional FEATURES label (e.g. `"FEATURES"`)
  - `theme_edge_label`: legacy unidirectional THEME label (e.g. `"THEME"`)
  - `theme_target_id`: Wonderland (or other theme anchor) page node id

## Verification

- Unit test: inspiration with 3 wonder-themed features → `"3"`.
- Integration: Inspirations Wonder view; Big Trouble in Little China row equals `7`.
