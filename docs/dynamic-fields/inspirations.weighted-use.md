# Inspirations — Weighted Use

## Summary

Sum of priority weights for all Features linked to an Inspiration.

## Database

- **NotionDatabase id:** `2eea538996934ce8abafc27132e576c1` (Inspirations)
- **Column key:** `weighted_use`
- **Column display name:** Weighted Use
- **Column type:** number

## Requirement

For each inspiration row:

1. Follow outgoing `FEATURES` relationships from the inspiration page to feature pages.
2. For each feature page, read the Features database membership relationship `(feature)-[:IS_A]->(Features DB)` and its `priority` property.
3. Map priority label to weight using `enums.priority.values` in [`content/model/schema.json`](../../content/model/schema.json) (interpreted as weights):

| Priority | Weight |
| --- | --- |
| Low | 1 |
| Medium | 2 |
| High | 4 |
| Consideration | 0 |
| (missing/other) | 0 |

4. **Must** sum weights across all linked features.
5. **Must** return the sum as a decimal string.

```text
weighted_use(inspiration) =
  sum over f in FEATURES targets of priorityWeight(feature.IS_A.priority)
```

`priorityWeight()` reads `enums.priority.values` from the loaded schema and treats each numeric value as a weight.

## Graph paths

| Role | Pattern |
| --- | --- |
| Inspiration row | `(inspiration)-[:IS_A]->(Inspirations DB)` |
| Feature link | `(inspiration)-[:FEATURES]->(feature)` |
| Priority source | `(feature)-[:IS_A {priority}]->(Features DB dd0de9867cc345b898929306bdf9fc83)` |

## Replaces legacy field

Notion rollup **Weighted Use** (`weighted_use` on `IS_A` relationship properties). No longer depends on Features **Weight** formula snapshots.

## Worked example

| Inspiration | Page id | Expected |
| --- | --- | --- |
| Big Trouble in Little China | (linked from Features; verify via graph search by title) | `33` |

Sum of priority weights across all linked features for this inspiration equals 33 in the current graph.

## Resolver and overlay

- **resolver_id:** `inspirations.weightedUse`
- **Overlay params:**
  - `inspiration_feature_composite`: composite type for inspiration↔feature links (e.g. `"inspirations_features"`)
  - `features_edge_label`: legacy unidirectional FEATURES label (e.g. `"FEATURES"`)
  - `features_database_id`: Features type-table node id for priority lookup

## Verification

- Unit test: inspiration with features at Medium+High → `6`.
- Integration: Inspirations Weighted view sorts/filters on computed `weighted_use`.
