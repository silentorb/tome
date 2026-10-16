# Multi-user

## Summary

Tome’s default is a **local single-operator** product (auth-free). **Multi-user** is an opt-in program for shared identity, authorization, and (for remote) SQL-authoritative design data. Core stays lean: a **lowest-common-denominator (LCD) authorization interface** and host seams; **authentication and specialized authorization live in extensions**. Design/corpus SQL and user/identity SQL are **separate stores** (two SQLite files locally; separate Postgres schemas remotely).

**Use-case labels** such as “local single-operator,” “local multi-user,” and “remote multi-user” are **documentation-only**. They describe common compositions of corpus store + user store + auth extensions. They are **not** first-class product modes: core packages **must not** introduce an explicit mode enum, mode flag, or mode-branched control flow. Behavior follows from what is wired (user store present or absent, auth/authz providers loaded or not, corpus backend). Tests and surface/dev helpers **may** name use cases for clarity.

This doc is the **living** agent-facing charter. Prefer it over archive roadmaps when implementing a phase.

## When to read this

- Planning or implementing multi-user, Account, authentication, authorization, SSO, or user administration
- Opening a user SQLite file / Postgres user schema vs corpus cache or corpus schema
- Writing a multi-user plan (must include **Non-multi-user package impact**)
- Deciding whether a change belongs in core vs an auth/authz extension

**Not** for: static site export multi-user (out of scope); multi-corpus sessions alone ([multi-corpus.md](./multi-corpus.md)); graph storage details ([tome-db.md](./tome-db.md), [graph-store.md](./graph-store.md)).

## Requirements

### Use-case shapes (implicit)

Content topology and identity are **independent axes**. Identity work may run on today’s flatfile→SQLite corpus stack; Postgres is required for remote concurrent design data, not for first identity/auth work.

These rows are **use cases**, not selectable modes in core:

| Use case (label only) | Design corpus | User SQL | Auth |
| --- | --- | --- | --- |
| **Local single-operator (default)** | Flatfile + corpus SQLite file | None | Auth-free |
| **Local multi-user** (dev / opt-in) | Flatfile + corpus SQLite file | **Separate SQLite file** | Present when auth extensions + user store are wired |
| **Remote multi-user** | **Postgres corpus schema** | **Separate Postgres user schema** | Present when auth extensions + user store are wired |

**Must:**

- Keep use-case labels **implicit** in core: no `mode` / `multiUser` enum or flag that packages switch on. Compose behavior from optional user-store wiring, loaded auth/authz providers, and corpus backend choice.
- When no user store and no auth providers are configured, Editor/HTTP **must** remain usable without identity (today’s default).
- Do **not** open or migrate a user store unless one is configured.
- Tests and surface/dev settings **may** name use cases or set convenience knobs; those **must not** become core package mode APIs.

### Corpus SQL vs user SQL

Keep **design/corpus** and **user/identity** as separate SQL stores (migrations, ownership, extension sandbox).

| Engine | Physical layout |
| --- | --- |
| **SQLite (local prototyping)** | Two files — corpus cache (e.g. `data/tome.sqlite`) and user DB (e.g. `data/tome-users.sqlite` or under `.tome/`). Auth extensions create tables **only** in the user file. |
| **PostgreSQL** | Separate schemas in the same database (corpus vs user). |

**Must:**

- Prefer real separation over **table-name prefixes** in a shared SQLite file.
- Treat user records as **not** design-graph nodes; graph Imp/SQL stays on the corpus store.
- Own graph migrations on the corpus file/schema; user/account + auth-extension migrations on the user file/schema only.
- Allow **mix-and-match** of content vs user layers (distinct paths/DSNs).

**SQLite cross-file caveat (accepted):** indexes spanning joins across separate files / `ATTACH` are weaker. Prototype first; explore manual workarounds before merging files with prefixed table names.

### Isolation (core vs extensions)

| Concern | Where it lives | Core’s job |
| --- | --- | --- |
| **Authorization** | Specialized logic in **extensions** (multiple strategies welcome) | LCD only: e.g. `authorize(principal, action, resource) → allow \| deny` (+ minimal resource vocabulary). Few call sites. No authz provider / null principal → allow / no-op. |
| **Authentication** | Prefer **entirely in extensions** (sessions, OIDC, sign-in/out UI) | Host seams to load auth extension, accept a **Principal**, pass into authz. No IdP logic in core. |
| **Account** | Persistence + admin lifecycle against the **user store** | Stable subject id for authz; not design-graph nodes. |
| **Profile** | Optional later | None for current product features. |
| **User administration** | Admin UI / extension ops over Accounts | Thin account APIs if needed; “who may administer” via authz extension. |

**Extension kinds (future):** today only `page-block` and `searcher` ([extensions.md](./extensions.md)). Multi-user **requires** new kinds / host seams: at least authentication provider and authorization provider; likely admin or shell slots. Kind contracts only in the host — not OIDC or product policy inside the host.

Existing corpus `readonly` / `protectedNodeIds` are resource rules without identity — fold under or sit beside the LCD authz interface over time rather than a second ad-hoc ACL style in core.

### Identity domains

| Domain | Responsibility | Priority |
| --- | --- | --- |
| **Account** | Authz subject, ownership hooks, activity, lifecycle (active/disabled); user admin operates here | **Required** when user identity is in play |
| **Authentication** | Methods (OIDC, etc.), sessions, sign-out, credentials | **Required** when user identity is in play, extension-owned |
| **Profile** | How a user appears to others; metadata | **Nice-to-have** — defer |

Do **not** model login identity as design-graph nodes.

### Non-multi-user package impact (standing rule)

Every multi-user implementation plan **must** include a **Non-multi-user package impact** section: which core packages change, why, and how thinly. Prefer “added authz call + extension load” over new policy branches in `tome-db`. Prefer optional seams (null principal, absent user store) over mode switches.

**Expected skeletal core touches (program-level):** extension host (new kinds), `tome-http` (principal + authorize), `tome-server` (optional user-store + auth-extension wiring), optional service-interface ports, thin editor shell slots, user-DB open/migrate helper when a user store is configured, later Postgres corpus + user schemas.

**Not expected in core:** explicit multi-user / operating-mode enums or flags, OIDC flows, rich ACL matrices, profile product UI, specialized authz policies, user tables inside the corpus SQLite/graph schema.

### Out of scope

- Static-site multi-user
- Rich authorization *product* policy in `tome-db` / `tome-http` (LCD + call sites only)
- Putting accounts or auth-extension tables in design-graph nodes or in the **corpus** file/schema
- Prioritizing Profile before Account + authz + admin
- Treating local multi-user as a substitute for Postgres authoritative graph on remote
- Core “mode” settings that encode the use-case table above

## Design rationale

Without isolation, authn/authz and Postgres concerns leak into `tome-db`, `tome-http`, and `tome-editor` and make the default single-operator path carry multi-user complexity forever. Authorization especially tends toward a core monolith if every product policy lands in general packages.

**Why extensions for authz:** keeps the fiddliest, most specialized web-app surface out of general systems; allows multiple authorization implementations without forking core.

**Why separate user SQL:** clear sandboxes and mix-and-match without prefix conventions; extension migrations never alter corpus DDL.

**Why local identity before Postgres graph:** identity and auth can dogfood on flatfile→SQLite; remote concurrency needs SQL-authoritative corpus later.

**Why implicit use cases:** an explicit mode variable invites every package to branch on “which world am I in?” Composition (optional user store + providers + corpus backend) keeps solo paths free of multi-user control flow.

## Behavior / pipeline

### Composition (not mode selection)

```
Configured pieces (independently)
  → corpus backend: flatfile+SQLite cache  |  Postgres corpus schema
  → user store: absent  |  user SQLite file  |  Postgres user schema
  → auth / authz extensions: absent  |  loaded

Resulting use case (documentation label only)
  → no user store, no auth → local single-operator (auth-free)
  → user SQLite + auth on flatfile corpus → local multi-user
  → Postgres corpus + user schema + auth → remote multi-user
```

### Identity → authorization (target shape)

```
Auth extension → Principal → Core LCD authz interface ← Authz extension (decide)
                                      ↓
                              allow or deny (tome-http / graph ops)
```

Account records live in the user store; user admin and (later) Profile hang off Account.

### Phase index

Prefer citing **this doc + phase id** when starting work. Update this table when phases land or reorder.

| Phase | Focus | Depends on |
| --- | --- | --- |
| **0 — Architecture charter** | This feature doc | — |
| **1 — Extension seams** | Auth/authz provider kinds; `Principal \| null`; default stays open without providers | 0 |
| **2 — LCD authorization interface** | Skeletal core API + allow/no-op without authz provider; few HTTP/write call sites | 1 |
| **3 — User SQL file + Account store** | Separate user SQLite file when configured; Account persistence; extension migrations in user DB | 1 |
| **4 — Authentication extension** | Sessions, sign-in/out; emit Principal for authz | 1–3 |
| **5 — OIDC** | SSO as auth-extension capability | 4 |
| **6 — Auth UI** | Sign-in via extension/shell slot | 4–5 |
| **7 — User administration** | Admin list/create/disable (gated by authz extension) | 3, 2, 4 |
| **8 — Postgres corpus + user schemas** | Remote authoritative corpus; separate user schema (+ account backend) | 0–3 |
| **9+ — Authz extension implementations** | Real policies (corpus → deeper); multiple strategies allowed | 2–4; remote needs 8 |
| **Later — Profile** | Profile records + pages | Nice-to-have |

Largest surfaces: extension-kind design (1), Postgres graph (8), and authz *implementations* (9+) — not core policy code.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Living charter (use-case shapes, isolation, phase index) |
| [`tasks/multi-user-system.md`](../../tasks/multi-user-system.md) (+ related stubs) | Optional backlog pointers into this program |
| User SQLite file / Postgres user schema | Future: Account + auth-extension tables only |
| Corpus SQLite / Postgres corpus schema | Design graph only — no user tables |

## Quick start

1. Read **Requirements** and the **phase index** for the phase you are implementing.
2. Include **Non-multi-user package impact** in the implementation plan.
3. Do not invent IdP, product ACL logic, or core mode enums/flags.

## Configuration

Conceptual (exact keys land in later phases):

- Optional **user store** path (SQLite) or DSN/schema (Postgres) — presence implies identity persistence is available.
- Distinct **corpus** path/DSN (already exists for content/cache; Postgres corpus later).
- Auth/authz **extensions** registered like other extensions when identity is wanted.

No core multi-user / operating-mode enable flag. Surface/dev or test helpers may still expose labeled presets; they are not package APIs.

Do not hard-code invented key names in dependents until a phase defines them.

## Verification

Phase 0 is documentation only. Later phases: full verify for affected repos + dependents per workbench `AGENTS.md` § Plan verification; reason about `.github/workflows/container.yml` when server/Docker/entrypoint changes.

## Implementation pointers

Future attachment points (not implemented in Phase 0):

| Area | Role |
| --- | --- |
| Extension registry/host | New provider kinds (auth, authz, admin/shell as needed) |
| `tome-http` | Principal on request; LCD `authorize` around dispatch |
| `tome-server` | Optional user-store open + auth-extension wiring when configured (not a mode switch) |
| `tome-service-interfaces` | Optional principal / authorize ports |
| `tome-editor` | Shell mount points for sign-in / admin; prefer extension-owned UI |
| User SQL open/migrate | Separate user file/schema when configured; extensions never alter corpus DDL |
| Corpus SQL (`tome-sqlite` / future postgres) | Graph only |

## See also

- [extensions.md](./extensions.md) — current kinds; multi-user kinds planned
- [tome-db.md](./tome-db.md) — corpus flatfile + SQLite cache
- [graph-store.md](./graph-store.md) — graph store API (corpus)
- [tome-server.md](./tome-server.md) — config-driven host
- [multi-corpus.md](./multi-corpus.md) — multiple content roots (orthogonal to multi-user)
- [web-api-design.md](./web-api-design.md) — HTTP API shape
- Backlog: [multi-user-system.md](../../tasks/multi-user-system.md), [authorization-system.md](../../tasks/authorization-system.md), [sso-login.md](../../tasks/sso-login.md), [postgresql-support.md](../../tasks/postgresql-support.md), [independent-sql-database.md](../../tasks/independent-sql-database.md)
