# SQL graph store (SQLite as canonical candidate)

## Summary

Design charter for treating **SQLite and Postgres as the same kind of store** — canonical-capable SQL graph backends that differ by **engine**, not by “cache vs source of truth.” Flatfile remains the **Git-oriented durable encoding** of a corpus, not a live human/agent edit API. Today’s preferred editor path (API write → flatfile → CacheSync → SQLite) is **transitional**; the stated product target is **API edits that branch** to SQL and flatfile together.

This document is **design only**: inventory, blockers, proposed SQLite schema, and interface LCD + optional capabilities. It does **not** ship DDL migrations or dual-write code.

## When to read this

- Aligning or migrating `tome-sqlite` toward Postgres SoT shape
- Designing dual-write API mutations (flatfile + SQL)
- Tightening `TomeGraphStoreBase` / Queryable / SQL module interfaces across adapters
- Revisiting “SQLite is ephemeral-only” or flatfile live-edit / watch-as-API residue
- Working `independent-sql-database` / `postgresql-support` tasks

## Requirements

### Store roles (target)

| Store | Role |
| --- | --- |
| **Flatfile** (`content/`) | Optimal **Git storage** of graph + model. Durable encoding for clone, review, and offline trees. **Not** the preferred live edit surface for humans or agents. |
| **SQLite** | Local **canonical-capable** SQL graph store (same SoT semantics as Postgres modulo engine). May run alone (SQL-only session) or beside flatfile (Git packaging + SQL). |
| **Postgres** | Server / specialty **canonical** SQL graph store (already SoT-shaped). |
| **CacheSync / observe** | Boot, import, repair, and rare recovery — **not** the definition of a product edit. Transitional while dual-write is unimplemented. |

**Ephemeral today, canonical candidate tomorrow:** Current local composition still treats SQLite as a derived query cache ([tome-db.md](./tome-db.md) § Local SQLite is ephemeral-only). That remains **accurate for running code** until a migration + dual-write land. This doc defines the **target** so those changes do not invent a third schema.

### Multi-implementation interfaces

For any contract with more than one database (or flatfile) implementation:

1. **Essential LCD** — Smallest surface every implementation must support for product graph CRUD and required Imp/query paths.
2. **Optional capability surfaces** — Features only some implementations offer; advertised via capability flags (or equivalent), not stuffed into the LCD.
3. **Graceful degradation** — Callers that need an optional feature detect support and weaken behavior (skip, alternate path, clear error at the use-case boundary). Implementations **must not** be forced to stub every non-essential method with `notImplemented`, and callers **must not** assume optional features exist.

### Schema alignment

- SQLite SoT DDL **must** match Postgres SoT **semantics** (tables, property bags, projection mirrors, model-in-DB, archive-as-flag).
- Differences **must** be **engine-only** (types, FTS mechanism, JSON storage form, concurrency).
- Cache-only shapes (primary EAV property maps, sync-mtime as durability gate, “writes never touch SQL”) **must not** define the long-term SQLite schema.

## Design rationale

- Chained **API → flatfile → cache** simplifies one-way sync but taxes every edit and has already accumulated special cases that erode that simplicity.
- Postgres already encodes a usable SoT shape; keeping SQLite on a divergent cache model doubles Imp binders and mental load.
- Flatfile’s practical value is Git diff/merge density, not interactive authoring. Designing sync around external live tree edits no longer matches product intent.
- A fat `TomeQueryCache` with many stubs on SoT backends fights LCD + capabilities. Prefer Base/Queryable + thin engine helpers and explicit optional modules (FTS, sync sink, expression indexes).

### Embracing JSON property bags (walk back from aversion)

Earlier SQLite cache work pushed **away from JSON** (promoted columns + EAV) under a mistaken belief that Postgres-style **JSONB** was a weak fit — in particular, underestimating that JSONB can be **indexed** (expression/path indexes, GIN, generated columns such as `search_vector` over `properties->>'title'`). Postgres SoT already stores node/edge properties and model documents as JSONB; the inventory above makes that dependence obvious.

**This migration backs up from that aversion and embraces JSON bags** as the shared SoT property representation (Postgres `JSONB`; SQLite JSON text + `json_extract` / expression indexes). Technically the SQL graph schema is **in part a document store**: open-ended property maps and model documents live as JSON documents inside relational tables. That is intentional for graph property bags — **not** an endorsement of popular document databases (e.g. MongoDB) as the product store. The spine remains relational (nodes, relationship records/projections, FKs, Imp SQL over tables); JSON is the typed bag for semi-structured properties and model payloads, with indexes where queries need them.

**Supersedes (for SoT-shaped SQL):** the package rule “no JSON property bag columns on SQLite by default” ([`tome-sqlite/AGENTS.md`](../../packages/tome-sqlite/AGENTS.md)) was a **cache** optimization driven by that JSON aversion (promoted columns + EAV). Target SoT SQLite **does** use a JSON text property bag (Postgres `JSONB` analogue). Optional denorm or expression indexes on hot keys remain engine optimizations on top of the bag, not a second source of truth for properties.

---

## Inventory: SQLite (cache) vs Postgres (SoT)

Sources: [`tome-sqlite/src/schema.ts`](../../packages/tome-sqlite/src/schema.ts) (`SCHEMA_VERSION` 18); [`tome-postgres/.../schema.ts`](../../../tome-postgres/packages/tome-postgres/src/schema.ts) (sibling mount).

Gap labels:

- **engine** — forced by SQLite vs Postgres (or FTS implementation choice)
- **use-case (cache)** — exists because SQLite is treated as a derived cache, not SoT
- **use-case (local session)** — needed for local multi-corpus / Git composition; may remain on SoT SQLite without being “cache”
- **parity gap** — Postgres SoT incomplete or SQLite has a useful column Postgres lacks

### Nodes

| Concern | SQLite (today) | Postgres (today) | Gap |
| --- | --- | --- | --- |
| Identity | `nodes.id` TEXT PK | same | — |
| Properties | Promoted columns (`title`, `alias`, `body`, `created_at`, `modified_at`) + `node_properties` EAV | Single `properties JSONB` + separate `body` column | **use-case (cache)** |
| Archive | `is_archived` INTEGER | `is_archived` BOOLEAN | **engine** (type) |
| Corpus ownership | `corpus_id` TEXT | none (solo `"default"` corpus) | **use-case (local session)** on SQLite; **parity gap** on Postgres multi-corpus |
| FTS | Separate FTS module / sync-fed index (not in core DDL) | Generated `search_vector` tsvector + GIN on `nodes` | **engine** / packaging |
| FK from edges | Rel tables do not FK to `nodes` | Rel tables `REFERENCES nodes(id) ON DELETE CASCADE` | **use-case (cache)** (sync may load edges before strict node presence) vs SoT integrity |

### Relationships

| Concern | SQLite (today) | Postgres (today) | Gap |
| --- | --- | --- | --- |
| Canonical records | `relationship_records` (`node_a`, `node_b`, `composite_type`, promoted `ordinal`/`order`/`priority`) | same endpoints + `properties JSONB` | **use-case (cache)** property storage |
| Projections | `relationship_projections` + promoted cols | projections + `properties JSONB`; UNIQUE (source, target, type) | **use-case (cache)**; UNIQUE is SoT hygiene SQLite should gain |
| Property EAV | `relationship_record_properties`, `relationship_projection_properties` | none (bags on parent rows) | **use-case (cache)** |
| Archived edges | **Not** in SQLite; live tree only; archive remains flatfile trees | Flag on nodes; no separate archive relationship tree in SQL | **use-case (cache)** + flatfile archive layout (Git); SoT uses flags |
| Expand | CacheSync / expand from flatfile | Write-time denorm in same DB | Topology (sync vs SoT write) |

### Corpora / model

| Concern | SQLite (today) | Postgres (today) | Gap |
| --- | --- | --- | --- |
| Corpora | `corpora` (`id`, `access`, `workspace_json`) | `corpora` (`id`, `access`, `content_label`); seeds `default` | **use-case (local session)** vs Postgres slim row |
| Model config | **Flatfile only** (`content/model/*.json`); not in SQLite | `model_documents` (`corpus_id`, `kind`, `document JSONB`) | **use-case (cache)** — SQL cannot be sole SoT without model-in-DB |
| Workspace | Embedded in `corpora.workspace_json` | Via model documents / labels | shape difference |

### Meta / freshness / derived

| Concern | SQLite (today) | Postgres (today) | Gap |
| --- | --- | --- | --- |
| `meta` KV | Yes (`content_mtime_ms`, enum fingerprint, …) | Yes (generic) | Shared table; **use-case (cache)** keys gate CacheSync rebuild |
| Expression indexes | `expression_indexes` + `expression_index_values` | same idea (`JSONB` for expression / dirty ids) | mostly **engine** (JSON type) |
| Clear-all relationships | `clearRelationshipCache` API | truncate / SoT wipe helpers | cache API smell |

### Imp / query binders

| Concern | SQLite path | Postgres path | Gap |
| --- | --- | --- | --- |
| Imp → SQL | `tome-imp-sql` assumes promoted columns + EAV subqueries ([tome-imp-sql.md](./tome-imp-sql.md)) | `tome-imp-postgres` against JSONB bags + projections | **use-case (cache)** forces two property-access strategies |
| Corpus filter | `nodes.corpus_id` | solo / incomplete multi-corpus | **parity gap** |

### Topology / write path (not DDL, but inventory)

| Concern | Flatfile + SQLite today | Postgres SoT today | Gap |
| --- | --- | --- | --- |
| Authoritative write | Flatfile (`ComposedGraphStore` → files) | SQL Base upserts | **use-case (cache)** |
| SQL update | CacheSync after write / watch | Same transaction as graph write | topology |
| Watch / external edit | `startWatching` → syncFile | N/A (SoT) | product residue |

---

## Blockers: what prevents today’s SQLite from being canonical

These are the constructs (schema + composition rules) that would **lose data or semantics** if flatfile were removed, or that prevent treating SQL as authoritative beside Git packaging.

1. **Durability charter** — Docs and host composition require durable graph + model in flatfile; deleting SQLite must be lossless. SQL is not allowed to be the only copy of product data in local sessions.

2. **Model not in SQLite** — Relationship types, schema, views, table-schemas, dynamic-properties, workspace/corpus metadata live in `content/model/`. Postgres SoT stores model in `model_documents`. Without model-in-DB, SQLite-alone cannot boot editor semantics.

3. **Property model is cache-shaped** — Promoted columns + EAV diverge from the SoT JSON bag. Imp SQL, codecs, and upsert paths are built around that split. A sole SQLite SoT would either keep a non-portable shape or force a migration anyway.

4. **No authoritative SQL write path in composition** — `ComposedGraphStore` writes flatfile only; domain code must not treat the cache as SoT. Dual-write cannot land cleanly while “writing SQL” is framed as corruption of a derived store.

5. **Freshness via content mtime meta** — `content_mtime_ms` / enum fingerprint exist to decide CacheSync rebuild from files. A canonical store’s durability is its own rows (plus Git export), not “does SQL match file mtimes.”

6. **Incomplete relationship universe** — Archived relationship files are excluded from the cache. Archive semantics for a SQL SoT must be flags (and optional soft-delete), not “missing rows mean look at archive/.”

7. **Referential looseness** — Lack of FK from relationship endpoints to `nodes` tolerates sync ordering; a SoT should enforce graph integrity (as Postgres does) or document an explicit deferral policy.

8. **Fat cache interface** — `TomeQueryCache` mixes essential graph ops, sync maintenance (`clearRelationshipCache`, meta markers), search windows, membership SQL, and export helpers. Postgres implements thin stubs. That split marks SQLite as “the cache API,” not “a graph SQL store.”

**Not blockers (keep or adapt):**

- **`corpus_id` / multi-corpus** — Required for local multi-corpus sessions; belongs on SoT SQLite as a **local session** feature (optional capability), and should eventually land on Postgres too.
- **Expression indexes** — Derived acceleration; valid on SoT as an optional/derived module, not proof of “cache-only.”
- **Worker RPC** — Engine/runtime packaging, not schema.

---

## Proposed SQLite SoT schema

Align with Postgres SoT modulo engine. Names stay shared where Imp/LCD expect them (`nodes`, `relationship_records`, `relationship_projections`, `corpora`, `meta`, expression index tables).

### Target tables (semantic)

**`nodes`**

| Column | Type (SQLite) | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `properties` | TEXT NOT NULL DEFAULT `'{}'` | JSON object (Postgres `JSONB`). Includes title, alias, timestamps, and open keys. |
| `body` | TEXT | Markdown body; same split as Postgres (body not only inside properties). |
| `is_archived` | INTEGER NOT NULL DEFAULT 0 | Boolean analogue. |
| `corpus_id` | TEXT | **Keep** for multi-corpus local sessions; Postgres should add when multi-corpus SoT lands (**parity**). |

Optional denorm (engine optimization, not second property SoT): generated/stored columns or indexes on `json_extract(properties,'$.title')` etc. Prefer indexes over duplicating promoted columns as the authoritative store of those keys.

**`relationship_records`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | `{a}:{b}:{type}` |
| `node_a`, `node_b` | TEXT NOT NULL | FK → `nodes(id)` ON DELETE CASCADE (SoT integrity) |
| `composite_type` | TEXT NOT NULL | |
| `properties` | TEXT NOT NULL DEFAULT `'{}'` | JSON; includes ordinal/order/priority |
| UNIQUE | `(node_a, node_b, composite_type)` | |

**`relationship_projections`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `record_id` | TEXT NOT NULL FK → records CASCADE | |
| `source_node_id`, `target_node_id` | TEXT NOT NULL FK → nodes CASCADE | |
| `type` | TEXT NOT NULL | projection type (`ULID:0` / `ULID:1` or equivalent) |
| `properties` | TEXT NOT NULL DEFAULT `'{}'` | JSON |
| UNIQUE | `(source_node_id, target_node_id, type)` | Match Postgres |

Drop as primary property storage: `node_properties`, `relationship_record_properties`, `relationship_projection_properties`, and promoted hot columns on nodes/edges **as the SoT representation**. Migration may keep temporary EAV/promoted mirrors during dual-support; target end state is bags + optional extract indexes.

**`corpora`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `access` | TEXT NOT NULL | |
| `content_label` | TEXT | Align with Postgres; migrate off embedding full `workspace_json` when workspace lives in `model_documents` |

**`model_documents`** (new for SQLite)

| Column | Type | Notes |
| --- | --- | --- |
| `corpus_id` | TEXT NOT NULL FK → corpora | |
| `kind` | TEXT NOT NULL | e.g. `associations`, `schema`, `views`, `table-schemas`, `workspace`, `dynamic-properties`, … |
| `document` | TEXT NOT NULL | JSON text |
| PRIMARY KEY | `(corpus_id, kind)` | |

Flatfile `content/model/*.json` remains the **Git projection** of these documents under dual-write / export — not a second incompatible model language.

**`meta`** — Retain for migrations, optional diagnostics, and transitional CacheSync keys. Canonical freshness for SoT sessions is row state (+ export), not `content_mtime_ms`.

**Expression index tables** — Keep; store JSON fields as TEXT JSON. Treat as **derived** (rebuildable), same as today.

**FTS** — Engine choice: SQLite FTS5 virtual table / external search module vs Postgres generated `tsvector`. Not part of the shared LCD DDL; advertise as optional search capability ([search.md](./search.md)).

### Archive semantics (SoT)

- Node archive = `nodes.is_archived`.
- Relationship archive = property or flag on the record **or** delete-from-live + Git archive tree only on the flatfile side.
- SQL SoT **must not** require reading `archive/relationships/` to answer ordinary queries.
- Flatfile archive trees remain a **Git packaging** concern for history/density; sync/export rules are a later dual-write/migration plan.

### Imp binder consequence

`tome-imp-sql` **must** move to property-bag access (json_extract / json functions) parallel to `tome-imp-postgres`, sharing LCD column names. Promoted+EAV compile path becomes legacy during migration.

### Migration design notes (no code in this plan)

1. Version-bump SQLite DDL; expand bags from promoted + EAV; backfill `model_documents` from flatfile model files when present.
2. Dual-support Imp compile (old and new) or one-shot migrate + lock-step binder change (workspace lock-step rule).
3. Keep CacheSync working against the new shape until dual-write exists (adapt expand/upsert, do not reintroduce EAV as SoT).
4. Add FKs only after sync ordering / rebuild guarantees no orphan edges (or enable FKs after full rebuild).
5. Postgres: add `corpus_id` (or equivalent) when multi-corpus SoT is required — track as parity, not “SQLite cache feature.”
6. Update `tome-sqlite` / root AGENTS “no JSON bags” guidance when implementation starts — this feature doc is the approval for SoT bags.

---

## Interface design: LCD + optional capabilities

### Essential LCD (graph)

Every **canonical graph** implementation (flatfile Base, SQLite SoT, Postgres SoT, and composed hosts) **must** support the semantic core of [`TomeGraphStoreBase`](../../packages/tome-graph-interfaces/src/graph-store.ts):

- Lifecycle: open/close (subscribe optional — see capabilities)
- Nodes: get / upsert / merge properties / delete; list ids
- Relationships: canonical record CRUD; directed projection upsert/delete/merge as today
- Model config read/write (from files **or** `model_documents` — storage is an implementation detail behind the LCD)
- Archive **flag** semantics for nodes (`isNodeArchived`); file-tree archive moves are **optional**
- Queryable tier when advertised: `executeImp` with declared `impExecution` backends

Writable SQL SoT modules **must** implement Base writes against SQL (as Postgres does), not only a query pipe.

### Optional capability surfaces

Advertise explicitly (sketch — names illustrative; implement in a later change):

| Capability | Meaning | Graceful degradation |
| --- | --- | --- |
| `queryable` / `impExecution` | Already on `GraphStoreCapabilities` | Non-queryable hosts skip Imp SQL paths; use Base iteration or refuse Imp-only features at the use-case boundary |
| `multiCorpus` | `listCorpora` / `locateNode` / `corpus_id` meaningful | Solo `"default"`; corpus operator no-ops or binds default |
| `archiveTrees` | Live vs `archive/` file moves | Flag-only archive (Postgres today); UI hides “move file to archive tree” or maps to flag |
| `observeSource` / `observeSink` | SyncEndpoint observe | No CacheSync edges; SoT-only or dual-write sessions |
| `gitFlatfileExport` | Can emit/consume `content/` tree | SQL-only deployments skip Git packaging |
| `fts` | Full-text search module | Fall back to LIKE / title scan / disable content search role |
| `expressionIndexes` | Derived sort indexes | Compute on the fly or disable fixed dyn sorts |
| `sqlQueryAll` | Raw SQL `queryAll` | Imp-execute or binder-only hosts |

**`TomeQueryCache`:** Treat as a **transitional** wide façade for the worker SQLite cache. Target: essential graph + SQL execution live on GraphStore / SQL module LCD; sync maintenance, search windows, and membership pipelines move behind optional interfaces or use-case services so Postgres/SQLite SoT are not stub farms.

### Where today’s split fights the model

| Today | Problem | Direction |
| --- | --- | --- |
| Writes → flatfile only; SQL via CacheSync | Edit latency + dual schema roles | Dual-write branch (next plans); SQL Base writes |
| `TomeQueryCache` fat API | SoT backends stub; LCD unclear | Shrink LCD; capabilities for the rest |
| `DataStoreKind` `sqlite` vs `queryable` | Encodes cache vs SoT in the kind name | Prefer capabilities (`canonicalSql`, `syncSink`) over kind-as-role |
| Watch as product freshness | Implies flatfile live-edit API | Watch = recovery; product edits update SQL (± flatfile) directly |
| Separate Imp binders for EAV vs JSONB | Tax of schema fork | One property-bag SQL dialect family |

### Graceful degradation rules

- **Detect, then weaken** — Feature code checks capabilities before calling optional APIs.
- **No silent no-ops** for essential LCD methods; optional absences fail clearly at the product boundary (“search unavailable”) or use a documented fallback.
- **Do not** require every adapter to implement sync-sink, archive-tree, or FTS methods.
- Cross-adapter uniformity of packaging remains **nice-to-have** ([graph-store.md](./graph-store.md)); LCD semantics are **essential**.

---

## Behavior / pipeline (target vs transitional)

**Transitional (current product default):**

```
API edit → flatfile → (watch|barrier) → CacheSync → SQLite cache → Imp/SQL reads
```

**Target:**

```
API edit → branch → SQLite SoT-shaped store
                  ↘ flatfile Git tree (export/packaging)
Reads → Imp/SQL against SQLite (or Postgres)
CacheSync → boot / import / repair only
```

SQL-only sessions omit the flatfile branch (already approximated by Postgres SoT-only `dataStores`).

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Authoritative design for SQLite SoT alignment + LCD/capabilities |
| `tome-sqlite` DDL (future) | Implement proposed schema |
| `tome-postgres` DDL | North star; absorb multi-corpus parity when needed |
| Flatfile `content/` | Git encoding; compatibility contract unchanged by this doc alone |
| Follow-on plans | DDL migration; dual-write mutations; CacheSync demotion |

## See also

- [tome-db.md](./tome-db.md) — storage, sync, ephemeral-only (transitional)
- [graph-store.md](./graph-store.md) — Base / Queryable API
- [tome-sync.md](./tome-sync.md) — dataStores + observe wiring
- [tome-imp-sql.md](./tome-imp-sql.md) — SQLite Imp binder (cache-shaped today)
- [multi-corpus.md](./multi-corpus.md) — `corpus_id` / session union
- [multi-user.md](./multi-user.md) — identity vs design stores
- [search.md](./search.md) — FTS as optional module
- [compatibility.md](./compatibility.md) — flatfile on-disk dual-support
- [independent-sql-database.md](../../tasks/independent-sql-database.md)
- [postgresql-support.md](../../tasks/postgresql-support.md)
- Flatfile bytes: [`packages/tome-flatfile/docs/storage-format.md`](../../packages/tome-flatfile/docs/storage-format.md)
