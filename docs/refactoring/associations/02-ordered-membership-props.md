# B2 — Ordered membership edge properties

## What it does

Set membership uses two composites (see [set-membership.md](../../features/set-membership.md)):

| Composite | Sequence | Placement metadata |
| --- | --- | --- |
| `member_of` | None | Row scalars from `table-schemas.json` only |
| `ordered_member_of` | `order` (default from `ordered` trait) | Same; sequence owned by `ordered-relationships.ts` |

Legacy `row_index` on `member_of` is **removed** — plain tables sort by title or view sorts; ordered tables use `order` on `ordered_member_of` only.

---

## Types and slugs involved

- **`member_of`** — plain set membership (`traits: ["set"]`).
- **`ordered_member_of`** — ordered set membership (`traits: ["set", "ordered"]`); Marloth: Scenes, Parts, Products (`membershipComposite` in `table-schemas.json`).
- **Ordered-collections view** — book tabs, part groups, DnD; uses `ordered_member_of` via `listOrderedMemberConnections` / `applySparseOrderRewrite`. Config in `ordered-collections.json` no longer names `membershipEdgeType` or `orderProperty`.

---

## Primary source files

| Module | Responsibility |
| --- | --- |
| `ordered-relationships.ts` | `maxOrderAtSet`, `stampOrderIfMissing`, `applySparseOrderRewrite` on `ordered_member_of` |
| `relationship-link-mutations.ts` | Resolves target composite; stamps `order` only when ordered |
| `node-create.ts` | `database-row` uses `membershipCompositeForSet`; ordered stamp when applicable |
| `set-membership.ts` | Generalized `listSetMemberRowConnections` / `membershipPerspectivesForSet` |
| `ordered-collections.ts` | Scene view layer (scopes, groups, moves) |
| `relationship-type-traits.ts` | `membershipCompositeForSet`, `orderedPropertyName`, trait array parsing |

---

## Model files

| File | Usage |
| --- | --- |
| `associations.json` | `member_of`, `ordered_member_of`; traits as array |
| `table-schemas.json` | `membershipComposite: "ordered_member_of"` on Scenes, Parts, Products |
| `relationships.json` | `ordered_member_of` + `order` for ordered sets; plain `member_of` without `row_index` |
| `views.json` | Scenes generator uses `ordered_members` |
| `ordered-collections.json` | Scope/group composites only (no membership edge type fields) |

Migration: `marloth-story/scripts/migrate-ordered-membership.ts`.

---

## Interactions

| Behavior | Interaction |
| --- | --- |
| **B1 / set trait** | Both composites carry `set`; tuple parent/child unchanged |
| **Ordered collections** | View config validates ordered `membershipComposite` on type/group databases |
| **Database view** | Plain tables: title sort; ordered tables: `order` sort |

---

## Related: `ordinal` on outgoing edges

`relationship-link-mutations.ts` and `node-create.ts` still auto-fill `ordinal` on **non-membership** outgoing edges when siblings use ordinals. That is separate from membership `order`.
