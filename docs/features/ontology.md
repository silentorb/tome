# Ontology runtime (predicates + patterns)

## Summary

Tome’s corpus model is an **ontology**: semantic-driven configuration of relationship meaning, traits, and constraints. Package [`tome-ontology`](../../packages/tome-ontology/) holds a store-independent **relationship runtime** (predicates + patterns). Today that runtime is **compiled from** legacy `associations.json` (relationship types file); the on-disk config shape is unchanged.

## Schema vs ontology (terminology)

The terms are nearly synonymous and can describe the same composition, but **emphasis differs**:

| Term | Emphasis |
| --- | --- |
| **Schema** | Structure (shapes, columns, file layouts, DDL) |
| **Ontology** | Meaning / semantics (while still structured) |

Tome’s model configuration is **ontology-first** — semantics drive the design; structure serves those semantics. Prefer **ontology** in new agent and feature-doc prose for Tome modeling. The package name `tome-ontology` reflects that.

Do **not** mass-rename existing “schema” identifiers. Narrow uses remain valid:

| Still called “schema” | Meaning |
| --- | --- |
| `content/model/schema.json` | Workspace enums (+ legacy relationshipRules) — see [schema.md](./schema.md) |
| `table-schemas.json` | Type-table column defs — see [table-schemas.md](./table-schemas.md) |
| SQLite `SCHEMA_VERSION` | Cache DDL version in `tome-sqlite` |
| `GET /api/schema` | HTTP that returns `schema.json` |
| Imp path ontology | Token binding in [tome-imp-sql.md](./tome-imp-sql.md) (related, Imp-facing) |

Design-domain meaning of Marloth nodes (features, products, …) lives in the corpus [`docs/ontology.md`](../ontology.md) — that is a **domain** ontology doc, not this runtime package.

## Runtime model

| Concept | Role |
| --- | --- |
| **Predicate** | Edge-kind identity + display metadata (`id`, `perspectives`). **No traits.** |
| **Pattern** | Match scope + attached traits / `linkExisting` / endpoint constraints |
| **RelationshipRuntime** | `predicates` + `patterns` with query helpers |

Plan 1 match context is `{ predicateId }` (optional `endpointIndex` for link-existing). Richer specificity (type-pair / instance patterns) is reserved for later.

**Traits attach to patterns**, not to predicates. Set / ordered / symmetric behavior is discovered by matching patterns for a predicate id.

## Config → runtime migration ladder

| Stage | Config → Runtime |
| --- | --- |
| Current (pre-Plan 1) | AC → AR (`associations.json` → definition helpers) |
| **Plan 1 (now)** | **AC → BR** (`compileAssociationConfig`) |
| Plan 2 (later) | AC → BR and BC → BR (new config also compiles to BR) |
| Plan 3 (later) | BC → BR only |

- **AC** — associations.json / `RelationshipTypesFile` (unchanged on disk).
- **BR** — predicate/pattern runtime in `tome-ontology`.
- **BC** — future better-authored config (not in this plan).

## AC → BR compile rules

`compileAssociationConfig(file)`:

1. For each `[id, def]` in `file.relationshipTypes`, emit predicate `{ id, perspectives }`.
2. Emit one pattern `{ id: "ac:"+id, match: { predicateId: id }, traits, linkExisting, endpoints }` from the same entry.

Flatfile loads AC (`loadRelationshipTypesFromContent`) and caches the compiled runtime (`loadRelationshipRuntimeFromContent`). Invalidating the relationship-types mtime cache clears both.

## Package layout

| Package | Owns |
| --- | --- |
| `tome-ontology` | BR types, match/query, `compileAssociationConfig` |
| `tome-flatfile` | AC parse/load/write; mtime-cached compile entrypoint; thin adapters |
| `tome-db` | Domain use (sets, pages, sync) querying BR |

## See also

- [sets.md](./sets.md) — set trait behavior (resolved via patterns)
- [schema.md](./schema.md) — workspace `schema.json` enums
- [tome-db.md](./tome-db.md)
- Package notes: [`packages/tome-ontology/AGENTS.md`](../../packages/tome-ontology/AGENTS.md)
