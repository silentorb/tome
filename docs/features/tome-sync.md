# Tome sync wiring

## Summary

Host sessions open a heterogeneous **`dataStores`** map and a floating Imp **`sync.graph`**. Modules are **building blocks**; the graph installs **who observes whom** and which **watch form** is active. It is **not** a sync executor and is **not** re-run on each change.

After wire-up:

- **Cold sync** — sinks apply `SyncSignal { scope: full, source }` (`runInitialFull` / CacheSync `ensureReady`).
- **API mutations** — `publishMutation` fans out the same signal (optional **preview** snapshots) to wired sinks **in parallel** with the flatfile Git persist.
- **External Git tip changes** — optional `tome.sync.gitWatch` observe source watches `.git/HEAD` (+ symbolic ref) and applies incremental scopes from `git diff`.
- **Content-tree FS watch** — `tome.sync.store` `observeOut` still means content-directory subscribe (tests / non-git corpora).

Flatfile’s product role is **optimal Git storage**, not a live write API for agents. Cross-corpus **dual-write** (git self-description) stays on the flatfile/Composite path and is distinct from cache **observation**.

**Preferred product hookup:** flatfile `dataStores` + SQLite query sink (+ sync-fed FTS) via observe edges. Workspace hosts typically use **`tome.sync.gitWatch`** → sinks so API disk writes do not double-apply through content FS watch. **Queryable SoT-only** configs omit flatfile sources and inbound observe edges.

## When to read this

- Configuring multiple flatfile corpora + SQLite cache (preferred topology)
- Choosing content-FS vs Git watch observe sources
- Configuring a Queryable SoT-only session (e.g. Postgres `dataStores`)
- Changing sync observer contracts or wiring
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
- Flatfile stores are the Git-backed **persist** surface when present; SQLite is a derived **sink** (query cache) in the preferred product topology.
- Exactly one designated **query** store for host `executeImp` (`sync.queryStoreId`): SQLite cache under CacheSync composition, or a Queryable SoT module when there is no flatfile union.

### Observe source forms

| Form | Node type | Steady-state trigger |
| --- | --- | --- |
| Content FS | `tome.sync.store` `observeOut` | Files under the corpus content tree |
| Git tip | `tome.sync.gitWatch` `observeOut` | Resolved commit hash change (HEAD / ref file) |

Pick **one** watch form per corpus. With Git watch, the sync graph is `gitWatch` → sink store nodes; the flatfile corpus remains a **`dataStores`** entry (CRUD / `asSource`) and does **not** need a flatfile `tome.sync.store` graph node.

Git watch persists last-synced tip in the session query store `meta` table as `git_watch_commit:<storeId>` (dynamic key/value — no schema migration). After cold/`full`, record the current tip as baseline. The host must have a `git` binary on `PATH` (`git diff --name-only`); release images install it via `docker/install-runtime.sh`.

### SyncSourceRead / SyncSignal

Observable sources **must** expose Imp queries:

```typescript
executeImp(graph, context?) → ImpCollectionResult | Promise<…>
```

```typescript
type SyncSignal = {
  source: SyncSourceRead;
  scope: SyncScope;
  preview?: SyncMutationPreview; // API publish only
};
```

- Watch paths omit `preview` and pull via `source`.
- API `publishMutation` may include **preview** (node/relationship snapshots) so sinks apply without waiting on disk.
- Six id sets: nodes/relationships × created/modified/deleted (**incremental** apply).
- Model/config markers use **`content`**; **`full`** for cold sync and unknown paths.

### Package-registered node types

- Built-in: **`tome.sync.store`** (`storeId`, observe in/out).
- Built-in: **`tome.sync.gitWatch`** (`storeId`, observe out only).
- Wire-up **must** reject unknown node types and incompatible port/capability pairs.

### Fan-in

When multiple flatfile sources observe into one SQLite sink, **`full`** refresh **must** aggregate all inbound sources (do not clear the cache between sources).

### Editor union

Multi-flatfile sessions still derive `CompositeStore` (or solo `ContentStore`) from flatfile `dataStores` entries for domain CRUD, dual-write, and active-corpus chrome.

## Design rationale

- Separating store settings from wiring keeps Imp graphs small and reusable.
- Mutation fan-out and Git watch share the same edge list so topology stays Imp-configured.
- Preview-bearing API signals enable parallel flatfile + cache/FTS updates.
- Git watch matches “flatfile = Git storage” without treating hand-edited markdown as an API.

## Behavior / pipeline

```
dataStores → open → DataStoreRegistry
sync.graph → SyncGraphWire (once)
  → observe edges: store FS subscribe and/or gitWatch HEAD/ref subscribe → sink.apply
startup: ensureReady + runInitialFull; gitWatch records tip baseline
API edit: publishMutation(write ∥ sink.apply with preview)
Git tip change: git diff → incremental/content scopes → sink.apply (pull)
```

## Configuration

See [tome-server.md](./tome-server.md). Git-watch example (workspace style):

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
    "queryStoreId": "session-cache",
    "graph": {
      "nodes": {
        "git:marloth": { "type": "tome.sync.gitWatch", "inputs": { "storeId": "marloth" } },
        "sink:session-cache": { "type": "tome.sync.store", "inputs": { "storeId": "session-cache" } }
      },
      "edges": {
        "obs:marloth->cache": {
          "from": { "node": "git:marloth", "port": "observeOut" },
          "to": { "node": "sink:session-cache", "port": "observeIn" }
        }
      }
    }
  }
}
```

Default when `sync.graph` omitted: each flatfile storeId → query sqlite storeId (**content FS** watch).

Non-SQLite sinks (e.g. `tome-search-sqlite` FTS) are additional `dataStores` entries wired with explicit observe edges. See [search.md](./search.md).

## Verification

- Package tests under `packages/tome-db/tests/sync/` and `packages/tome-server/tests/`.
- Always-on CacheSync timing baseline: `packages/tome-db/tests/content/cache-sync-benchmark.test.ts`.
- Full suite: `bash scripts/run-in-tome.sh run test` from the workbench.

## Implementation pointers

| Area | Path |
| --- | --- |
| Types / wire-up / adapters / git watch / publish | `packages/tome-db/src/sync/` |
| Server config parse | `packages/tome-server/src/load-services.ts` |
| Legacy CacheSync | `packages/tome-db/src/content/sync.ts` (sqlite observer + preview apply) |

## See also

- [multi-corpus.md](./multi-corpus.md) — corpora as flatfile dataStores; dual-write ≠ observation
- [tome-db.md](./tome-db.md) — content ↔ cache
- [graph-store.md](./graph-store.md) — Base / Queryable / executeImp
- [tome-server.md](./tome-server.md) — host config
