# C — Migration residue

## What it does

During earlier relationship model migrations, many **named composite storage types** (e.g. `scenes_characters`, `products_features`) were consolidated into the generic `includes` bucket. Some code paths still recognize the **legacy composite names** for read/query compatibility.

This is technical debt—not an active write-path behavior. New links via B6 resolve to `includes` or current registered composites, not to most names in the migration set.

---

## Legacy composite name set

[`packages/tome-db/src/includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts) — `MIGRATE_TO_INCLUDES_STORAGE_TYPES`:

```
inspirations_features, inspirations, scenes_characters, scenes_location,
products_features, products_characters, products, solutions_features,
solutions_products, solutions_scenes, solutions, features_bible_passages,
features, groups_characters, characters_character_attributes
```

`isMigratableToIncludesStorageType(type)` checks membership in this set.

---

## Where it is used

### Database view relation lookup

[`packages/tome-db/src/database-view-relations.ts`](../../../packages/tome-db/src/database-view-relations.ts)

When resolving relation cells with a `targetDatabaseId`, the code may compute a composite name from `connectionType` and `inferInverseRelationType`. If that composite is **not** in the migratable set, it queries relationships for the named composite. If it **is** migratable, that branch is skipped (includes lookup or outgoing projection used instead).

```84:98:/workspaces/tome/packages/tome-db/src/database-view-relations.ts
  if (targetDatabaseId && !TAXONOMY_INSPIRATION_PERSPECTIVES.has(connectionType)) {
    const compositeType = compositeTypeForPerspectives(
      connectionType,
      inferInverseRelationType(connectionType),
    );
    if (!isMigratableToIncludesStorageType(compositeType)) {
      const byComposite = listRelationshipsForComposite(db, nodeId, compositeType);
      // ...
    }
  }
```

### Marloth migration scripts

[`marloth-story/scripts/migrate-to-includes.ts`](../../../../marloth-story/scripts/migrate-to-includes.ts) — one-time content migration referencing the same type family (archival tooling, not runtime).

---

## Relationship to current registry

Marloth `relationship-types.json` still registers **some** specific composites that overlap conceptually with the migration set (e.g. `scenes_product`, `scenes_part`) for ordered associations and table-schema inverses—these are **active** types, not residue.

The migration set names types that should no longer appear as storage types in new content; existing `relationships.json` rows may still use `includes` after migration.

---

## Interactions

| Behavior | Interaction |
| --- | --- |
| **B3** | Migration target storage type is `includes` |
| **B6** | Write path does not reference `MIGRATE_TO_INCLUDES_STORAGE_TYPES` |
| **B5** | `inferInverseRelationType` used alongside migratable check for composite name construction |

---

## Duplication note

[`packages/tome-db/scripts/audit-relationship-resolution.ts`](../../../packages/tome-db/scripts/audit-relationship-resolution.ts) maintains its own expanded copy of includes perspective slugs for auditing—separate from runtime `INCLUDES_PERSPECTIVE_SLUGS` (maintenance drift risk).
