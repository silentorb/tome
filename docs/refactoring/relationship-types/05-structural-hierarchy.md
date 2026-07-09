# B5 — Structural hierarchy (`parents_children`)

## What it does

**Parent/child** relationships within a type (typically self-referential hierarchy on a type table) use composite storage type `parents_children` with perspectives `children` and `parents`.

Unlike associative many-to-many (B3), hierarchy links use **structural one-to-many** presentation on node pages (`addMode: "none"` unless overridden)—not link-existing.

The read path for database relation cells sometimes needs the **inverse perspective** to find the correct composite when querying across type tables.

---

## Perspective slugs involved

Hardcoded in [`includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts):

- `PARENTS_CHILDREN_PERSPECTIVES`: `parents`, `children`
- `PARENTS_CHILDREN_COMPOSITE`: `"parents_children"`

Registry entry:

```json
"parents_children": {
  "perspectives": ["children", "parents"]
}
```

`table-schemas.json` relation columns may declare `"perspective": "parents"` or `"children"` on self-referential columns.

---

## Primary source files

### Classification

[`packages/tome-db/src/includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts)

- `PARENTS_CHILDREN_PERSPECTIVES`, `PARENTS_CHILDREN_COMPOSITE`
- Excluded from `isIncludesPerspectiveSlug` (B3)
- **Not** in `relationSectionSupportsLinkExisting` — structural, not link-existing

### Write path

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts) — step 1:

```86:89:/workspaces/tome/packages/tome-db/src/content/resolve-composite-for-link.ts
  if (PARENTS_CHILDREN_PERSPECTIVES.has(normalized)) {
    return PARENTS_CHILDREN_COMPOSITE;
  }
```

[`packages/tome-db/src/content/store.ts`](../../../packages/tome-db/src/content/store.ts) imports `PARENTS_CHILDREN_*` for tuple matching (via shared includes-relationship module).

### Inverse perspective inference (read path)

[`packages/tome-db/src/database-view-relations.ts`](../../../packages/tome-db/src/database-view-relations.ts)

```105:117:/workspaces/tome/packages/tome-db/src/database-view-relations.ts
function inferInverseRelationType(localType: string): string {
  switch (localType) {
    case "scenes":
      return "location";
    case "location":
      return "scenes";
    case "parents":
      return "children";
    case "children":
      return "parents";
    default:
      return localType;
  }
}
```

Used with `compositeTypeForPerspectives(connectionType, inferInverseRelationType(connectionType))` to query named composites when resolving relation cells across databases.

The `scenes` ↔ `location` pair is a **non-hierarchy** hardcoded inverse (named composite `scenes_location` in Marloth registry)—not derived from `parents_children` or registry perspectives alone.

---

## Model files used today

| File | Usage |
| --- | --- |
| `relationship-types.json` | `parents_children` composite |
| `table-schemas.json` | Self-referential relation columns with `parents` / `children` perspectives |
| `relationships.json` | Stored as `type: "parents_children"` |

---

## Interactions with other behaviors

| Behavior | Interaction |
| --- | --- |
| **B3** | Parents/children slugs do not collapse to `includes`. |
| **B6** | Resolver step 1; early exit before taxonomy and table-schema branches. |
| **B7** | Structural add mode (`none`) for perspectives not in link-existing sets. |
| **B3/B6** | `scenes`/`location` inverse in `inferInverseRelationType` is separate hardcode for cross-type composite lookup. |

---

## Tuple semantics

`parents_children` uses asymmetric perspectives. Tuple order for new links is determined by `orderedEndpointsForLocalType` in `store.ts` based on which perspective the user linked from (B6).
