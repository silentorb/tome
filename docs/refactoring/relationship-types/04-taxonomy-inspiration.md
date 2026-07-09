# B4 — Taxonomy↔inspiration family

## What it does

Certain taxonomy perspectives link to inspirations using **named composite storage types** following the pattern `{taxonomy_perspective}_inspirations` (e.g. `monsters_inspirations`, `pacing_inspirations`).

These are **not** collapsed into the generic `includes` bucket (B3). They are registered bidirectional composites in `relationship-types.json` with asymmetric perspectives (taxonomy on one side, `inspirations` on the other).

The write path constructs the composite name via `compositeTypeForPerspectives(perspective, "inspirations")` and requires the composite to exist in the registry.

---

## Perspective slugs involved

Hardcoded in [`includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts) as `TAXONOMY_INSPIRATION_PERSPECTIVES`:

```
monsters, pacing, story_scale, traversal_types, traversal_reasons, prop_type
```

Marloth registry examples (`relationship-types.json`):

```json
"monsters_inspirations": {
  "perspectives": ["inspirations", "monsters"]
},
"pacing_inspirations": {
  "perspectives": ["inspirations", "pacing"]
}
```

(Perspective order in the file follows registry convention; storage composite name is lexicographically sorted pair.)

---

## Primary source files

### Slug set and exclusions

[`packages/tome-db/src/includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts)

- `TAXONOMY_INSPIRATION_PERSPECTIVES`
- Excluded from `isIncludesPerspectiveSlug` (B3)
- Included in `relationSectionSupportsLinkExisting` (B7) — supports link-existing like associative types

### Write path

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts) — step 2:

```91:97:/workspaces/tome/packages/tome-db/src/content/resolve-composite-for-link.ts
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) {
    const composite = compositeTypeForPerspectives(normalized, "inspirations");
    if (registry.types[composite] && isDualPerspectiveType(registry.types[composite])) {
      return composite;
    }
  }
```

If the composite is not registered, resolution falls through to later ladder steps.

### Read path

[`packages/tome-db/src/database-view-relations.ts`](../../../packages/tome-db/src/database-view-relations.ts)

- `shouldUseIncludesLookup` returns **false** for taxonomy slugs
- Composite lookup branch skipped when `TAXONOMY_INSPIRATION_PERSPECTIVES.has(connectionType)` — uses direct outgoing projection instead

---

## Model files used today

| File | Usage |
| --- | --- |
| `relationship-types.json` | One composite entry per taxonomy↔inspiration pair |
| `relationships.json` | Stored as specific composite types, not `includes` |
| `schema.json` | May define rules per composite or perspective |

---

## Interactions with other behaviors

| Behavior | Interaction |
| --- | --- |
| **B3** | Explicitly **not** includes-collapsed; separate storage composites. |
| **B6** | Resolver step 2, before table-schema inverse and includes fallback. |
| **B7** | Link-existing enabled via `relationSectionSupportsLinkExisting`. |

---

## Naming convention

Composite type name: `compositeTypeForPerspectives(taxonomySlug, "inspirations")` — reverse lexicographic sort of the two slugs joined with `_`. The taxonomy slug must be in the hardcoded set for step 2 to apply; composites already in the registry can also be resolved by step 4 (direct registry lookup) if the perspective appears in `perspectives`.
