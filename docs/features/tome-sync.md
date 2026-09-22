# Tome sync wiring

## Summary

Host sessions open a heterogeneous **`dataStores`** map and a floating Imp **`sync.graph`**. The graph **only initializes observer relationships** between stores (who observes whom). It is **not** a sync executor and is **not** re-run on each change. After wire-up, observers notify sinks with a **`SyncSignal`**: an Imp-queryable **`SyncSourceRead`** plus a **`SyncScope`** (`full` or six normalized id sets). Cross-corpus **dual-write** (git self-description) stays on the flatfile/Composite path and is distinct from cache **observation**.

## When to read this

- Configuring multiple flatfile corpora + SQLite cache
- Changing sync observer contracts or wiring
- Registering sync Imp node types from packages
- Relating multi-corpus sessions to the query cache

## Requirements

### Two configuration layers

| Layer | Role |
| --- | --- |
| **`dataStores`** | Heterogeneous module entries (`module` / `export` / opaque per-kind `options`); runtime map keyed by id |
| **`sync.graph`** | Floating Imp wiring; nodes reference **`storeId` only** (no store settings in the graph) |

Legacy `store` + `cache` (+ nested `corpora` / `TOME_CORPORA`) **must** migrate at parse time into `dataStores` + a default sync graph.

### Graph role

- Sync graph **must** install observers at boot only.
- Sync graph **must not** perform ongoing sync via Imp collection execution.
- Graph **must** be a DAG; cycles fail boot.
- Flatfile stores are canonical **sources**; SQLite is a derived **sink** (query cache) in the default product topology.
- Exactly one designated **query** SQLite store for `ComposedGraphStore` / host `executeImp` (`sync.queryStoreId` or the unique sqlite sink).

### SyncSourceRead

Observable sources **must** expose Imp queries:

```typescript
executeImp(graph, context?) → ImpCollectionResult | Promise<…>
```

Flatfile uses `impExecution: "execute"`; SQLite uses `sql`. Sinks pull current values via `source` — signals carry **ids**, not row bodies.

### SyncScope

```typescript
type SyncEntityOps = { created: SyncIdSet; modified: SyncIdSet; deleted: SyncIdSet };
type SyncPartialScope = { nodes: SyncEntityOps; relationships: SyncEntityOps };
type SyncScope = { mode: "full" } | { mode: "partial"; changes: SyncPartialScope };
type SyncSignal = { source: SyncSourceRead; scope: SyncScope };
```

- Six id sets: nodes/relationships × created/modified/deleted.
- Relationship ids are canonical record ids `{a}:{b}:{type}`.
- Model/config file changes (associations, schema, …) use **`full`**, not fake entity ids.
- `created`/`modified`: sink reads source then upserts; `deleted`: sink removes by id.

### Package-registered node types

- Packages **may** register `SyncNodeLibrary` catalogs (ports + signal types).
- Built-in: **`tome.sync.store`** with `storeId` input and observe in/out ports typed for `tome.sync.signal`.
- Wire-up **must** reject unknown node types and incompatible port/capability pairs.

### Fan-in

When multiple flatfile sources observe into one SQLite sink, **`full`** refresh **must** aggregate all inbound sources (do not clear the cache between sources).

### Editor union

Multi-flatfile sessions still derive `CompositeStore` (or solo `ContentStore`) from flatfile `dataStores` entries for domain CRUD, dual-write, and active-corpus chrome.

## Design rationale

- Separating store settings from wiring keeps Imp graphs small and reusable.
- Observer wire-up matches a floating topology better than treating sync as Imp collection data-flow.
- Imp `executeImp` is already the shared read language across flatfile and SQL.
- Six normalized id sets keep partial notifications cheap and unambiguous.

## Behavior / pipeline

```
dataStores → open → DataStoreRegistry
sync.graph + SyncNodeTypeRegistry → SyncGraphWire (once)
  → for each edge A→B: B observes A
startup: sinks apply SyncSignal { scope: full, source }
steady state: source events → SyncPartialScope → sink apply (Imp wiring idle)
```

## Configuration

See [tome-server.md](./tome-server.md). Example:

```json
{
  "version": 2,
  "dataStores": {
    "marloth": {
      "module": "tome-flatfile",
      "export": "createFlatfileModule",
      "options": { "contentPath": "…/marloth-story/content", "access": "readwrite" }
    },
    "session-cache": {
      "module": "tome-sqlite",
      "export": "createSqliteModule",
      "options": { "dbPath": "…/session.sqlite" }
    }
  },
  "sync": {
    "graph": { "nodes": { "…": "tome.sync.store + storeId" }, "edges": { "…": "observeOut → observeIn" } },
    "queryStoreId": "session-cache"
  },
  "services": []
}
```

Default when `sync.graph` omitted: each flatfile storeId → query sqlite storeId.

Non-SQLite sinks (e.g. `tome-search-sqlite` FTS) are additional `dataStores` entries wired with explicit observe edges (e.g. marloth → fts) so indexing can be corpus-selective. See [search.md](./search.md).

## Verification

- Package tests under `packages/tome-db/tests/sync/` and `packages/tome-server/tests/`.
- Full suite: `bash scripts/run-in-tome.sh run test` from the workbench.

## Implementation pointers

| Area | Path |
| --- | --- |
| Types / wire-up / adapters | `packages/tome-db/src/sync/` |
| Server config parse | `packages/tome-server/src/load-services.ts` |
| Legacy CacheSync | `packages/tome-db/src/content/sync.ts` (wrapped by sqlite observer) |

## See also

- [multi-corpus.md](./multi-corpus.md) — corpora as flatfile dataStores; dual-write ≠ observation
- [tome-db.md](./tome-db.md) — content ↔ cache
- [graph-store.md](./graph-store.md) — Base / Queryable / executeImp
- [tome-server.md](./tome-server.md) — host config
