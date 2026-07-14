# Dynamic property specifications

Authoritative logic for **dynamic table view columns** — computed at read time from the property graph, not stored on `IS_A` relationship properties.

When adding or changing a dynamic property:

1. Write or update the spec file here first (requirements trump implementation).
2. Implement the resolver in `packages/tome-db/src/dynamic-properties/resolvers/`.
3. Seed overlay configuration via `scripts/seed-dynamic-properties.ts`.

See [dynamic-properties.md](../features/dynamic-properties.md) for the system feature spec.

## Registered fields

| Spec | Database | Column key / pattern | Resolver |
| --- | --- | --- | --- |
| [characters.all-scene-count.md](./characters.all-scene-count.md) | Characters | `all_scene_count` | `characters.allSceneCount` |
| [characters.scene-count-by-product.md](./characters.scene-count-by-product.md) | Characters | `scene_count__{productId}` | `characters.sceneCountByProduct` |
| [inspirations.weighted-use.md](./inspirations.weighted-use.md) | Inspirations | `weighted_use` | `inspirations.weightedUse` |
| [inspirations.wonder.md](./inspirations.wonder.md) | Inspirations | `wonder` | `inspirations.wonder` |

## Spec template

Copy when authoring a new field:

```markdown
# <Database> — <Column name>

## Summary

## Owner

- **Type table node id:**
- **Column key:**
- **Column display name:**
- **Column type:** number | text | …

## Requirement

(Must/should language; precise logic in prose and pseudocode.)

## Graph paths

(Relationship labels, anchor node ids, membership databases.)

## Replaces legacy field

(If any — legacy computed column key on `IS_A` relationship properties.)

## Worked example

(Real node ids and expected values from the graph.)

## Resolver and overlay

- **resolver_id:**
- **Overlay params:** (JSON keys and meanings)

## Verification

(Steps or test names to confirm correctness.)
```
