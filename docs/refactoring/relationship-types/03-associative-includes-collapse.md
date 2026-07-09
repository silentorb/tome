# B3 — Associative storage collapse (`includes`)

## What it does

Many cross-entity associations are **symmetric many-to-many** links. Rather than a separate storage composite per column perspective, numerous perspective slugs collapse to a **single storage bucket**: `includes`.

From the member endpoint, both sides project as `includes` (registered as a symmetric composite in `relationship-types.json`).

When the editor or API creates a link with a local perspective like `characters` or `features`, the write path often stores it as `type: "includes"` while the UI and queries still use the original perspective slug.

---

## Perspective slugs that collapse to `includes`

Hardcoded in [`includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts) as `INCLUDES_PERSPECTIVE_SLUGS`:

```
includes, inspirations, features, characters, location, products,
solutions, bible_passages, groups, character_attributes, scenes,
scenes_2, themes, theme, motivation
```

`isIncludesPerspectiveSlug` returns false for slugs in `TAXONOMY_INSPIRATION_PERSPECTIVES` (B4) and `PARENTS_CHILDREN_PERSPECTIVES` (B5).

---

## Primary source files

### Classification

[`packages/tome-db/src/includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts)

- `INCLUDES_TYPE = "includes"`
- `INCLUDES_PERSPECTIVE_SLUGS` — set above
- `isIncludesPerspectiveSlug`, `isIncludesStorageType`
- `resolveStorageTypeForPerspective` — includes slug → `includes`, else registry lookup
- `relationSectionSupportsLinkExisting` — includes slugs enable link-existing add mode (B7)

### Write path

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts) — step 5: `isIncludesPerspectiveSlug` → `INCLUDES_TYPE` (after more specific routes fail).

[`packages/tome-db/src/content/store.ts`](../../../packages/tome-db/src/content/store.ts)

- `entryMatchesLocalType` — if stored type is `includes`, match any includes perspective slug
- `upsertRelationship` / `findRelationship` use `resolveCompositeTypeForLink`

### Schema rule lookup

[`packages/tome-db/src/schema-rules/resolve.ts`](../../../packages/tome-db/src/schema-rules/resolve.ts)

```6:9:/workspaces/tome/packages/tome-db/src/schema-rules/resolve.ts
function ruleLookupType(localType: string): string {
  const normalized = normalizeRelationshipType(localType);
  return isIncludesPerspectiveSlug(normalized) ? INCLUDES_TYPE : normalized;
}
```

`schema.json` `relationshipRules` use `type: "includes"` for rules that apply to all collapsed perspectives.

### Read path (database table cells)

[`packages/tome-db/src/database-view-relations.ts`](../../../packages/tome-db/src/database-view-relations.ts)

- `shouldUseIncludesLookup` — true for includes perspective slugs (excludes taxonomy slugs)
- `listRelationConnectionsForRow` — when target database is set, tries `listIncludesIncident` first for includes slugs

### Node page grouping

[`packages/tome-db/src/node-page-sections.ts`](../../../packages/tome-db/src/node-page-sections.ts)

- `relationGroupKey` — for `includes` storage type, groups by target instance's type: `includes:{targetTypeId}`
- `relationGroupKeyFromColumn` — table-schema relation columns with includes slugs use the same grouping key

### Node creation ordinal

[`packages/tome-db/src/node-create.ts`](../../../packages/tome-db/src/node-create.ts) — `nextOutgoingOrdinal` treats includes-perspective outgoing edges as sharing ordinals with stored `includes` type.

---

## Model files used today

| File | Usage |
| --- | --- |
| `relationship-types.json` | Registers symmetric `includes` composite |
| `relationships.json` | Many edges stored as `type: "includes"` |
| `schema.json` | Rules keyed by `includes` for associative link targets |
| `table-schemas.json` | Relation columns declare `perspective` slugs (many are includes slugs) |

Most includes-slug perspectives are **not** separate keys in `relationship-types.json`—only the `includes` composite is registered.

---

## Interactions with other behaviors

| Behavior | Interaction |
| --- | --- |
| **B4** | Taxonomy inspiration slugs are explicitly **excluded** from includes collapse. |
| **B5** | `parents` / `children` excluded from includes collapse. |
| **B6** | Includes fallback is the last successful branch before error in the resolution ladder. |
| **B7** | Includes slugs get `link-existing` add mode; sections grouped by `includes:targetTypeId`. |
| **C** | Legacy named composites may still exist in data; read path has separate migration lookup (see [08-migration-residue.md](./08-migration-residue.md)). |

---

## Key hardcoded branch

```70:75:/workspaces/tome/packages/tome-db/src/includes-relationship.ts
export function isIncludesPerspectiveSlug(localType: string): boolean {
  const normalized = normalizeRelationshipType(localType);
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) return false;
  if (PARENTS_CHILDREN_PERSPECTIVES.has(normalized)) return false;
  return INCLUDES_PERSPECTIVE_SLUGS.has(normalized);
}
```
