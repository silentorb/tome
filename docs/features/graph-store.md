# Graph store API

## Summary

**Two-tier domain graph API** for integrators and Tome hosts: **`TomeGraphStoreBase`** (imperative CRUD on canonical storage, flatfile-viable without SQL) and **`TomeGraphStoreQueryable`** (read queries via **`executeImp`**, Imp graphs executed by SQL lowering or `imp-execution`).

Replaces ad-hoc use of separate `TomeDataStore` + `TomeQueryCache` at call sites. Legacy store/cache modules remain host infrastructure during migration.

## When to read this

- Third-party tools reading/writing `content/` without SQLite
- Adding graph persistence or query adapters
- Wiring `executeImp` for editor, extensions, or scripts
- Future SQL-only deployments (single authoritative backend)

## Requirements

### Tiers

| Tier | Contract | Writes | Reads |
| --- | --- | --- | --- |
| **Base** | Durable graph + model config | Imperative CRUD | Point get + O(n) iteration |
| **Queryable** | Base + Imp query execution | Same as Base | **`executeImp(graph)`** |

**Mutations must not use Imp graphs** in v1 — read-only Imp on Queryable tier.

### Base operations

Must support solo and multi-corpus flatfile (`CompositeStore`):

- Lifecycle: `open`, `close`, `subscribe` / unsubscribe ([`StoreChangeEvent`](../packages/tome-service-interfaces/src/index.ts))
- Corpus: `listCorpora`, `locateNode`, `contentDirForNode`
- Nodes: `getNode`, `upsertNode`, `mergeNodeProperties`, `deleteNode` (markdown body separate from YAML)
- Relationships: canonical record CRUD + directed projection CRUD (expansion via [`expandRelationshipEntry`](../../packages/tome-flatfile/src/relationship-expand.ts))
- Model config: associations, schema, views, table-schemas, workspace, dynamic-properties, etc.
- Archive: live vs archived file trees
- Iteration: `listNodeIds`, `forEachRelationshipRecord`

Base **must not** expose cache-shaped query methods or raw SQL.

### Queryable: `executeImp`

```typescript
executeImp(
  graph: Graph,
  context?: { pageNodeId?: string; parameters?: Record<string, unknown> },
): ImpCollectionResult
```

| Backend | Capability | Path |
| --- | --- | --- |
| **sql** | Production host | `compileImpGraphToTomeSql` → `queryAll` |
| **execute** | Flatfile integrators | `imp-execution` → host RowSource ([`tome-imp-flatfile`](../../packages/tome-imp-flatfile/)) |

Capability detection:

```typescript
type GraphStoreCapabilities =
  | { queryable: false }
  | { queryable: true; impExecution: "sql" | "execute" | ("sql" | "execute")[] };
```

### Layering (not alternatives)

| Layer | Package | Role |
| --- | --- | --- |
| Flatfile I/O | `FlatfileGraphStore` | File persistence |
| Dynamic runtime | `imp-execution` | Walk Imp DAG; read-only host |
| Tome flatfile host | `tome-imp-flatfile` | RowSource over flatfile scans |
| SQL binder | `tome-imp-sql` | Compile to SQL |
| Composed host | `ComposedGraphStore` | Base→flatfile, executeImp→sql, internal `CacheSync` |

### Editor vs integrator

- **`TomeGraphServices`** / HTTP — application use cases; not the integrator contract ([web-api-design.md](./web-api-design.md))
- Integrators use **`TomeGraphStoreBase`** / **`TomeGraphStoreQueryable`** directly

## Design rationale

- Flatfile is canonical for git-tracked corpora; SQLite is a derived query cache today.
- Third parties need domain CRUD without warming SQLite.
- **Imp as read language** avoids mirroring every cache method on flatfile.
- **`imp-execution`** (successor to [imp-kotlin execution](https://github.com/silentorb/imp-kotlin/tree/master/projects/execution/src/main/kotlin/silentorb/imp/execution)) shares operator semantics with `imp-sql`; hosts supply data only.
- Imp effects stay **discrete** — default execute path is read-only ([execution.md](../../../imp/docs/features/execution.md)).

## Behavior / pipeline

**Tome host (composed):**

1. Writes → `FlatfileGraphStore` → change events → `CacheSync` → SQLite
2. Reads → `executeImp` → `tome-imp-sql` → SQLite `queryAll`

**Flatfile integrator (no SQL):**

1. Writes → `FlatfileGraphStore`
2. Reads → `executeImp` → `imp-execution` → `tome-imp-flatfile` (O(n), opt-in)

## Implementation pointers

| Area | Path |
| --- | --- |
| Interfaces | [`packages/tome-graph-interfaces/src/graph-store.ts`](../../packages/tome-graph-interfaces/src/graph-store.ts) |
| Flatfile adapter | [`packages/tome-flatfile/src/graph-store/`](../../packages/tome-flatfile/src/graph-store/) |
| Composed adapter | [`packages/tome-db/src/graph-store/`](../../packages/tome-db/src/graph-store/) |
| Imp execution spec | [`imp/docs/features/execution.md`](../../../imp/docs/features/execution.md) |
| Legacy store/cache | [`packages/tome-service-interfaces/`](../../packages/tome-service-interfaces/) |

## Migration phases

| Phase | Status | Scope |
| --- | --- | --- |
| **1 — Infrastructure** | Done | `TomeGraphStoreBase` / `Queryable`, `ComposedGraphStore`, `tome-imp-flatfile`, `recentNodesGraph`, `typeMembersGraph` |
| **2 — Read-path migration** | Done | Imp `contains` + `search`; editor search + extensions on `executeImp`; drop `includeBody` toggle; `searchNodesGraph` |
| **3+ — Remaining cache reads** | Planned | `getNodePageDetail`, table views, graph explorer; public REST `executeImp`; Imp mutations |

Phase 2 removes direct `searchNodes(cache)` and extension `sqlQuery.queryAll` for Imp graphs. Search heuristics (title+body, title-first ranking, `matchPreview` on body-only hits) live in Tome adapters (`performTomeTextSearch`, flatfile `textSearch`).

## See also

- [tome-db.md](./tome-db.md) — storage and sync
- [tome-imp-sql.md](./tome-imp-sql.md) — SQL binder
- [tome-query.md](./tome-query.md) — Imp query page block
- [multi-corpus.md](./multi-corpus.md)
