# Characters — All Scene count

## Summary

Count of all scenes linked to a character, regardless of product scope.

## Database

- **NotionDatabase id:** `f984a934ad644f8480b0f8f51449569f` (Characters)
- **Column key:** `all_scene_count`
- **Column display name:** All Scene count
- **Column type:** number

## Requirement

For each character row (`NotionPage` node with `IS_A` membership in the Characters database):

- **Must** count outgoing relationships labeled `SCENES` from the character page to scene pages.
- **Must** return the count as a decimal string (e.g. `"113"`).
- **Must** override any stale value stored on the `IS_A` relationship property of the same key.

```text
all_scene_count(character) =
  |{ e : (character)-[:SCENES]->(scene) }|
```

## Graph paths

| Role | Pattern |
| --- | --- |
| Row page | Character `NotionPage` |
| Membership | `(character)-[:IS_A]->(Characters DB)` |
| Counted relationships | `(character)-[:SCENES]->(scene)` |

## Replaces legacy field

Notion formula column **All Scene count** (`all_scene_count` on `IS_A` relationship properties). Imported snapshots are often stale.

## Worked example

| Character | Page id | Expected |
| --- | --- | --- |
| James | `14f6a0f77a694f4cb18881bb58846c94` | `113` |

James has 113 outgoing `SCENES` relationships in the current graph.

## Resolver and overlay

- **resolver_id:** `characters.allSceneCount`
- **Overlay params:**
  - `characters_scene_composite`: composite relationship type for character↔scene links (e.g. `"scenes_characters"`). When set, tried before legacy edge label.
  - `scenes_edge_label`: legacy unidirectional relationship label (e.g. `"SCENES"`). Used only when param is non-empty and composite path yields no edges.

## Verification

- Unit test: character with N `SCENES` relationships returns `"N"`.
- Integration: Characters database view includes `all_scene_count`; James row equals 113.
