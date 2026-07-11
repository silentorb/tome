# B7 — Relation-section presentation (node page)

## What it does

On an **instance node page**, outgoing relationships are rendered as **relation table sections**—one section per perspective/group, with columns from edge properties, add-mode controls, and titles.

Presentation logic branches on relationship type names and includes-classification helpers. Labels can come from `associations.json` `perspectiveLabels` or fall back to formatted slug titles.

---

## Section structure

[`packages/tome-db/src/node-page-sections.ts`](../../../packages/tome-db/src/node-page-sections.ts) builds `RelationTableSection`:

| Field | Behavior |
| --- | --- |
| `title` / `label` | From type node title, `perspectiveLabels`, or `formatAssociationLabel` |
| `addMode` | `"link-existing"` or `"none"` — see below |
| `linkAddLabel` | From `perspectiveLabels.linkAdd` or default `"Link {singular}"` |
| `allowedTargetTypeIds` | From `schema.json` rules or table-schema column target |
| `rows` | Targets of outgoing edges in the group, with property cells |

---

## Sort order

`relationTypeSortKey` sorts sections alphabetically except membership types sort **last**:

```122:125:/workspaces/tome/packages/tome-db/src/node-page-sections.ts
function relationTypeSortKey(type: string): string {
  if (isTypeMembershipType(type)) return "z:member_of";
  return `a:${type}`;
}
```

`isTypeMembershipType` checks `member_of` and `members` ([`labels.ts`](../../../packages/tome-db/src/labels.ts)).

---

## Grouping

`relationGroupKey` — non-includes types group by projection `type`; `includes` storage groups by target instance's type id:

```134:141:/workspaces/tome/packages/tome-db/src/node-page-sections.ts
function relationGroupKey(
  db: GraphDatabase,
  connection: { type: string; targetNodeId: string },
): string {
  if (normalizeRelationshipType(connection.type) !== INCLUDES_TYPE) return connection.type;
  const targetTypes = typeIdsForInstance(db, connection.targetNodeId);
  if (targetTypes.length === 1) return `${INCLUDES_TYPE}:${targetTypes[0]}`;
  return INCLUDES_TYPE;
}
```

`relationGroupKeyFromColumn` aligns table-schema empty sections with the same keys for includes slugs.

`parseIncludesGroupKey` reverses `includes:{typeId}` group labels for title and perspective resolution.

---

## Hidden sections

Sections whose perspective is `members` are **skipped** on instance pages (membership viewed from the set side, not as instance outgoing UI):

```250:251:/workspaces/tome/packages/tome-db/src/node-page-sections.ts
    const { perspective: groupPerspective } = parseIncludesGroupKey(label);
    if (groupPerspective === MEMBERS_TYPE) continue;
```

---

## Add mode selection

```333:337:/workspaces/tome/packages/tome-db/src/node-page-sections.ts
      addMode: isTypeMembership
        ? "link-existing"
        : relationSectionSupportsLinkExisting(perspective)
          ? "link-existing"
          : "none",
```

`relationSectionSupportsLinkExisting` ([`includes-relationship.ts`](../../../packages/tome-db/src/includes-relationship.ts)) returns true for:

- `includes` type or `includes:` group keys
- Includes perspective slugs (B3)
- Taxonomy inspiration slugs (B4)

Returns false for structural types like `parents` / `children` (B5).

Membership sections always use link-existing (link to type table).

---

## Labels

[`packages/tome-db/src/association-label.ts`](../../../packages/tome-db/src/association-label.ts)

- `perspectiveDisplayLabel` — prefers `perspectiveLabels` from registry; optional `compositeType` disambiguates shared slugs
- `perspectiveLinkAddLabel` — `linkAdd` from registry or default
- `formatAssociationLabel` — title-case slug fallback

Only `member_of` has rich `perspectiveLabels` in Marloth registry today.

---

## Schema and table-schema integration

- `relationshipRuleContextForType` supplies `allowedTargetTypeIds` from `schema.json`
- `tableRelationByGroupKeyForInstance` adds empty sections for relation columns declared on the instance's type tables when `includeSchemaEmptySections` is set
- `resolveTypeNodeId` — for `member_of`, uses single target set id; else tries title match via `findTypeNodeByTitle`

---

## Model files used today

| File | Usage |
| --- | --- |
| `associations.json` | `perspectiveLabels` for section titles and link-add copy |
| `schema.json` | Allowed target types per perspective |
| `table-schemas.json` | Column perspectives and targets for empty sections |

---

## Interactions

| Behavior | Interaction |
| --- | --- |
| **B1** | Membership sort-last; `members` hidden; membership link-existing |
| **B2** | `RELATION_META_KEYS` strips row_index/view from displayed cells |
| **B3** | Includes grouping by target type; link-existing for includes slugs |
| **B4** | Taxonomy slugs get link-existing |
| **B5** | Parents/children typically `addMode: none` |

Presentation does not affect how edges are stored (B6).
