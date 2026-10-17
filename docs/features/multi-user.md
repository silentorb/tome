# Multi-user

## Summary

Tome’s default is a **local single-operator** product. **Multi-user** is an opt-in program for shared identity, authorization, and (for remote) SQL-authoritative design data. Core owns a **thin web-API identity/session layer** and **fundamental denial authorizers** (additive / fail-closed). **Specialized authentication strategies (e.g. OIDC) and rich authorization policies** prefer extensions. Local solo stays security-conscious with a **light grant** (explicit `allow-everything` in server config)—not a silent fail-open. Design/corpus SQL and user/identity SQL are **separate stores** (two SQLite files locally; separate Postgres schemas remotely).

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
| **Authorization (Denial)** | Built-in **deny-everything** / **allow-everything**; specialized policies via extension `authorizationModule` (mix-and-match slots) | **Fundamental:** Imp-query + modification **authorizer** slots; server **defaults to deny-everything**; consult on Imp + modification HTTP paths; 403 on deny. Additive — access is granted, never open-by-default. |
| **Authorization (Filtering)** | Later (prefer query mutation) | Seams when phase work lands |
| **Authorization (Probing)** | Later (UX boundary APIs) | Seams when phase work lands |
| **Authentication** | Thin **Principal + Session** vocabulary and session create/delete on the **web API**; OIDC and rich IdP flows prefer extensions | Resolve `Principal \| null` per request. No IdP protocol logic in core. |
| **Account** | Persistence + admin lifecycle against the **user store** | Stable subject id for authz; not design-graph nodes. |
| **Profile** | Optional later | None for current product features. |
| **User administration** | Admin UI / extension ops over Accounts | Thin account APIs if needed; “who may administer” via authz policy. |

**Authorizer slots (Denial):** separate interfaces — `ImpQueryAuthorizer` and `ModificationAuthorizer` — not one bundled provider and not HTTP verbs. See [authorization-authorizers.md](../extensions/authorization-authorizers.md).

**Extension kinds:** `page-block`, `searcher`, `authentication-provider` ([extensions.md](./extensions.md)). Denial authorizers register via optional `authorizationModule` (host APIs), not a single megaprovider kind. Shell/admin kinds may come later.

Existing corpus `readonly` / `protectedNodeIds` are resource rules without identity — fold under or sit beside Denial / Filtering over time rather than a second ad-hoc ACL style in core.

### Identity domains

| Domain | Responsibility | Priority |
| --- | --- | --- |
| **Account** | Authz subject, ownership hooks, activity, lifecycle (active/disabled); user admin operates here | **Required** when user identity is in play |
| **Authentication** | Sessions, sign-in/out, credentials; OIDC as a later strategy | **Required** when user identity is in play (web API owns thin session/Principal; strategies may be extension-owned) |
| **Profile** | How a user appears to others; metadata | **Nice-to-have** — defer |

Do **not** model login identity as design-graph nodes.

### Non-multi-user package impact (standing rule)

Every multi-user implementation plan **must** include a **package impact** section: which core packages change, why, and how thinly. Prefer “authorizer call + extension policy” over new ACL matrices in `tome-db`. Prefer composition (authorizer slots, optional user store) over mode switches.

**Security is fundamental:** Denial consultation lives in `tome-http` / `tome-server` even for local solo. Solo stays light by **explicitly** configuring `allow-everything` (e.g. workbench config)—never by omitting the denial path or defaulting to allow in code.

**Expected skeletal core touches (program-level):** `tome-http` (Principal + sessions + Imp/modification authorizer call sites), `tome-server` (deny default + allow built-ins + authorization registry), `tome-interfaces` (authorizer contracts), extension host (OIDC / authorization modules / shell kinds as needed), optional service-interface ports, thin editor shell slots, user-DB open/migrate helper when a user store is configured, later Postgres corpus + user schemas.

**Not expected in core:** explicit multi-user / operating-mode enums or flags, OIDC protocol implementations, rich product ACL matrices, profile product UI, user tables inside the corpus SQLite/graph schema.

### Out of scope

- Static-site multi-user
- Rich authorization *product* policy in `tome-db` / `tome-http` (LCD + call sites only)
- Putting accounts or auth-extension tables in design-graph nodes or in the **corpus** file/schema
- Prioritizing Profile before Account + authz + admin
- Treating local multi-user as a substitute for Postgres authoritative graph on remote
- Core “mode” settings that encode the use-case table above

## Design rationale

Without isolation, specialized IdP and product ACL concerns leak into `tome-db` and `tome-editor`. Denial machinery itself must stay fundamental in the request path once security exists—optional/fail-open authz is a footgun.

**Why additive denial:** secure baseline is deny; access is granted (allow-everything or richer authorizers). Never “open unless denied.”

**Why authorizer slots in core, policy in extensions:** call sites and fail-closed defaults are product safety; specialized who-may-do-what stays swappable without forking `tome-http`.

**Why separate Imp vs modification authorizers:** different payload families; mix and match without a bundled megainterface.

**Why separate user SQL:** clear sandboxes and mix-and-match without prefix conventions; extension migrations never alter corpus DDL.

**Why local identity before Postgres graph:** identity and auth can dogfood on flatfile→SQLite; remote concurrency needs SQL-authoritative corpus later.

**Why implicit use cases:** an explicit mode variable invites every package to branch on “which world am I in?” Composition (authorizer grants + optional user store + providers + corpus backend) keeps solo light without a mode flag.

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

### Identity → authorization (Denial)

```
Session / auth strategy → Principal (web API request scope)
                                      ↓
              Imp query authorizer  |  Modification authorizer
              (default deny-everything; allow-everything or extension grant)
                                      ↓
                         allow → handler  |  deny → 403 forbidden
```

**Later subdomains:** Filtering (open-ended query row visibility); Probing (UX permission-boundary APIs).

Account records live in the user store; user admin and (later) Profile hang off Account.

### Phase index

Prefer citing **this doc + phase id** when starting work. Update this table when phases land or reorder.

**Order:** general authentication (including sessions) **before** authorization. Authorization is a large subject and may span multiple implementation sessions.

| Phase | Focus | Depends on |
| --- | --- | --- |
| **0 — Architecture charter** | This feature doc | — |
| **1 — General authentication** | Sign-in, **sessions**, sign-out; `Principal \| null` on the web API; testable without authorize. In-memory sessions OK; durable user-store sessions deepen under this phase or as a follow-on within it. | 0 |
| **2 — SSO (OIDC)** | Single sign-on via OIDC on top of the authentication layer | 1 |
| **3 — Authorization** | Denial + Filtering + Probing; **spans multiple sessions** | 1 |
| **4 — User authentication page(s)** | Sign-in / sign-out UI | 1–2 |
| **5 — User account page(s)** | Account admin / account UI (user SQL / Account store as needed) | 1, 3 |
| **6 — User profile and profile page(s)** | Profile records + pages | 5 |
| **7 — PostgreSQL** | Better concurrency; corpus + separate user schemas as needed | 0–1 (remote graph needs corpus schema) |

**Phase 1 progress:** web API owns `Principal` / `Session`, in-memory `SessionStore`, `POST/DELETE /api/sessions`, `GET /api/me`, request-scoped principal via `Authorization: Session <id>`.

**Phase 2 progress:** `authentication-provider` extension kind + host routes `GET /api/auth/login` / `GET /api/auth/callback`; same-site session cookie `tome_session` (plus `Authorization: Session`); reference package `tome-auth-oidc` (auth-code + PKCE); API has **no CORS**. Editor sign-in UI remains phase 4; Account/user SQL remains later.

**Phase 3a progress (Denial):** separate `ImpQueryAuthorizer` + `ModificationAuthorizer`; core deny-everything (server default) and allow-everything (explicit only); wired on Imp + modification HTTP paths; workbench config explicitly sets allow-everything for light solo; extension `authorizationModule` can replace slots. Filtering, probing, catch-all for other APIs, and folding `readonly` / `protectedNodeIds` remain later 3x sessions.

Largest surfaces: authorization (3), Postgres graph (7), and auth UI / account / profile (4–6) — not core ACL matrices.

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

- Phase 1 web API sessions use an **in-memory** store by default (no config). Credentials: `Authorization: Session <sessionId>` **or** same-site cookie `tome_session` (header wins). Prototype create body may pass `subjectId` until Account exists; create/delete also set/clear the cookie.
- **Same-site only:** browser clients call the API via the UI origin `/api` proxy (Vite in `editor:dev`). The application API does **not** speak CORS. OIDC `redirectUri` must be the UI-origin callback (e.g. `http://127.0.0.1:5173/api/auth/callback`). Do not point `VITE_TOME_API_URL` at the API port for cookie SSO.
- OIDC via `extensions.json` `kind: "authentication-provider"` + `authenticationModule` (at most one enabled). Reference params for `tome-auth-oidc`: `issuer`, `clientId`, `clientSecret` or `clientSecretEnv`, `redirectUri`, optional `scopes` (default `openid`), `subjectClaim` (default `sub`), `postLoginRedirect` (default `/`). See [authentication-providers.md](../extensions/authentication-providers.md).
- Optional **user store** path (SQLite) or DSN/schema (Postgres) — durable sessions / Account when configured (still under authentication / account phases).
- Distinct **corpus** path/DSN (already exists for content/cache; Postgres corpus later).
- **Denial authorizers** in `tome-server.json` `authorization`:
  - `impQueryAuthorizer`: `"deny-everything"` \| `"allow-everything"` (default **deny-everything**)
  - `modificationAuthorizer`: same (default **deny-everything**)
  - Workbench solo: set both to `"allow-everything"` explicitly ([tome-server.workbench.json](../../packages/tome-server/config/tome-server.workbench.json)).
  - Extension `authorizationModule` may replace either slot after built-ins apply. See [authorization-authorizers.md](../extensions/authorization-authorizers.md).

No core multi-user / operating-mode enable flag. Surface/dev or test helpers may still expose labeled presets; they are not package APIs.

## Verification

Phase 0 is documentation only. Phase 1+: full verify for affected repos + dependents per workbench `AGENTS.md` § Plan verification; reason about `.github/workflows/container.yml` when server/Docker/entrypoint changes. Denial tests should prove default deny, explicit allow, and independent Imp vs modification slots.

## Implementation pointers

| Area | Role |
| --- | --- |
| `tome-http` identity | `Principal` / `Session`, in-memory `SessionStore`, request scope, `/api/sessions`, `/api/me`, cookie + `/api/auth/*` (phases 1–2) |
| `tome-http` denial | Imp query + modification authorizer consultation; 403 `forbidden` (phase 3a) |
| `tome-interfaces/authorization` | Separate authorizer interfaces + deny/allow built-ins |
| Extension registry/host | `authentication-provider` (phase 2); `authorizationModule` registration (phase 3a); admin/shell kinds as needed (phases 4–5) |
| `tome-auth-oidc` | Reference OIDC auth-code + PKCE provider |
| `tome-server` | Session store; authn provider; **AuthorizationRegistry** (deny default); passes authorizers to HTTP |
| `tome-service-interfaces` | Session / authentication / authorizer ports on `TomeServiceHost`; `authorization` config |
| `tome-editor` | Shell mount points for sign-in / account / profile (phases 4–6); `/api` proxy for same-site |
| User SQL open/migrate | Separate user file/schema when configured; extensions never alter corpus DDL |
| Corpus SQL (`tome-sqlite` / future postgres) | Graph only (Postgres phase 7) |

## See also

- [extensions.md](./extensions.md) — kinds including authentication-provider
- [authentication-providers.md](../extensions/authentication-providers.md) — authn kind guide
- [tome-db.md](./tome-db.md) — corpus flatfile + SQLite cache
- [graph-store.md](./graph-store.md) — graph store API (corpus)
- [tome-server.md](./tome-server.md) — config-driven host
- [multi-corpus.md](./multi-corpus.md) — multiple content roots (orthogonal to multi-user)
- [web-api-design.md](./web-api-design.md) — HTTP API shape (includes thin identity/session)
- Backlog: [multi-user-system.md](../../tasks/multi-user-system.md), [authorization-system.md](../../tasks/authorization-system.md), [sso-login.md](../../tasks/sso-login.md), [postgresql-support.md](../../tasks/postgresql-support.md), [independent-sql-database.md](../../tasks/independent-sql-database.md)
