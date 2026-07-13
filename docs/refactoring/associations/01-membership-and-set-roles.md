# B1 — Set membership and set node roles

## What it does

**Set membership** links a **member node** to a **set node** (type table, Archive hub, or future set-like containers). In storage, all membership edges use composite type `member_of` with asymmetric perspectives:

- From the member: perspective `member_of`
- From the set: perspective `members`

Tuple convention: member at index `a`, set at index `b` (member position matches `perspectives[0]`).

**Set node role** is separate from the edge type: a node is treated as a "set" if it is a key in `table-schemas.json`, the workspace `archiveNodeId`, or (fallback) has membership traffic that implies type-table status. Instance nodes discover their type(s) via outgoing `member_of` edges to set nodes.

---

## Types and slugs involved

| Name | Role |
| --- | --- |
| `member_of` | Storage type and member-side perspective |
| `members` | Set-side perspective (inverse projection) |

Constants in [`labels.ts`](../../../packages/tome-db/src/labels.ts): `MEMBER_OF_TYPE`, `MEMBERS_TYPE`, `TYPE_MEMBERSHIP_TYPES`.

Registry entry in Marloth `associations.json`:

```json
"member_of": {
  "perspectives": ["member_of", "members"],
  "perspectiveLabels": {
    "member_of": { "title": "Membership", "linkAdd": "Link type table" }
  }
}
```

---

## Primary source files

### Membership queries and set detection

[`packages/tome-db/src/set-membership.ts`](../../../packages/tome-db/src/set-membership.ts)

- `SET_MEMBERSHIP_TYPE` — literal `"member_of"`
- `isSetMembershipStorageType`, `isMembershipPerspective`
- `memberSetIds`, `setMemberIds`, `listSetMembership`
- `collectSetNodeIds` — union of `table-schemas.json` keys + `archiveNodeId` from workspace
- `setKindForNode` — `"type_table"` | `"archive"` | null
- `isSetNode`, `findSetMembershipRelationship`, `listSetMemberRowConnections`

### Type-table / instance classification

[`packages/tome-db/src/node-capabilities.ts`](../../../packages/tome-db/src/node-capabilities.ts)

- `hasIncomingIsA` — checks `member_of` / `members` projections (name is legacy)
- `isTypeTableNode` — has `table-schemas.json` entry OR incoming membership
- `typeIdsForInstance` — delegates to `memberSetIds` (member's set IDs)

### Archive membership

[`packages/tome-db/src/archive-status.ts`](../../../packages/tome-db/src/archive-status.ts) — `isArchivedNode` walks membership edges to `workspace.archiveNodeId`.

[`packages/tome-db/src/relationship-archive.ts`](../../../packages/tome-db/src/relationship-archive.ts) — content-file archive marking; `isArchiveMembershipEntry` checks `member_of` type + archive hub endpoint.

[`packages/tome-db/src/graph.ts`](../../../packages/tome-db/src/graph.ts)

- `listArchiveMemberIds` — SQL filters `type IN ('members', 'member_of')`
- `recomputeArchivedFlags` — uses archive membership list
- `nodeMatchesAnyAllowedType` — loops `member_of` outgoing edges

### Node creation and linking

[`packages/tome-db/src/node-create.ts`](../../../packages/tome-db/src/node-create.ts)

- `database-row` link kind creates `member_of` with row props (see B2)
- `outgoing` link with `membershipTypeId` adds `member_of` to a type table

[`packages/tome-db/src/relationship-link-mutations.ts`](../../../packages/tome-db/src/relationship-link-mutations.ts) — `linkOutgoingRelationship` treats `MEMBER_OF_TYPE` + type-table target specially (B2).

### Write-path routing

[`packages/tome-db/src/content/resolve-composite-for-link.ts`](../../../packages/tome-db/src/content/resolve-composite-for-link.ts) — step 0: membership perspectives always resolve to `member_of` storage.

### Ordered collections

[`packages/tome-db/src/ordered-collections-config/ordered-collections-file.ts`](../../../packages/tome-db/src/ordered-collections-config/ordered-collections-file.ts) — parser requires `membershipEdgeType === "member_of"`.

Marloth `ordered-collections.json` sets `"membershipEdgeType": "member_of"` for `scenes-by-book`.

### Type membership audit

[`../../../../marloth-story/scripts/lib/type-membership-audit.ts`](../../../../marloth-story/scripts/lib/type-membership-audit.ts) — audits instance↔type-table membership using `isTypeTableNode` and set-trait edges (Marloth legacy-export hygiene; not tome runtime).

---

## Model files used today

| File | Usage |
| --- | --- |
| `associations.json` | Registers `member_of` composite and perspectives |
| `table-schemas.json` | Keys define type-table set nodes; columns are per-set schema |
| `workspace.json` | `archiveNodeId` — Archive hub set node |
| `relationships.json` | Stored edges with `type: "member_of"` |

Set identity is **structural** (schema key or workspace archive id), not a property on the edge.

---

## Interactions with other behaviors

| Behavior | Interaction |
| --- | --- |
| **B2** | Ordered sets stamp `order` on `ordered_member_of`; plain `member_of` holds table-schema scalars only (no view / row_index). |
| **B6** | Membership is the first branch in `resolveAssociationIdForLink` (step 0). |
| **B7** | Membership sections sorted last; `members` perspective sections hidden on instance pages. |
| **B3** | Distinct from `includes` — set containment is a separate relationship family per [sets.md](../../features/sets.md). |

---

## Key hardcoded branches

```15:21:/workspaces/tome/packages/tome-db/src/set-membership.ts
export function isSetMembershipStorageType(type: string): boolean {
  return type === SET_MEMBERSHIP_TYPE;
}

export function isMembershipPerspective(perspective: string): perspective is MembershipPerspective {
  return (MEMBERSHIP_PERSPECTIVES as readonly string[]).includes(perspective);
}
```

```42:53:/workspaces/tome/packages/tome-db/src/set-membership.ts
export function collectSetNodeIds(contentDir?: string): Set<string> {
  const dir = contentDir ?? resolveContentPath();
  const ids = new Set<string>();
  const schemas = loadTableSchemasFromContent(dir);
  for (const id of Object.keys(schemas.tables)) ids.add(id);
  try {
    ids.add(archiveNodeId(dir));
  } catch {
    /* workspace.json optional in tests */
  }
  return ids;
}
```

```285:292:/workspaces/tome/packages/tome-db/src/graph.ts
  listArchiveMemberIds(archiveId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT
           CASE WHEN source_node_id = ?1 THEN target_node_id ELSE source_node_id END AS member_id
         FROM relationship_projections
         WHERE type IN ('members', 'member_of')
```
