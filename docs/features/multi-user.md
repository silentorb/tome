# Multi-user

## Summary

Tome’s default is a **local single-operator** product. **Multi-user** is an opt-in program for shared identity, authorization, and (for remote) SQL-authoritative design data. Core owns a **thin web-API identity/session layer** and **fundamental denial authorizers** (additive / fail-closed). **Specialized authentication strategies (e.g. OIDC) and rich authorization policies** prefer extensions. Local solo stays security-conscious with a **light grant** (explicit `allow-everything` in server config)—not a silent fail-open.

**Identity is a graph, not Account SQL rows.** Canonical Account and role data live as **nodes** (and relationships) in one or more **user corpora** — identity content roots separate from design/content corpora. Auth specialty data (sessions, IdP↔Account bindings, credentials) stays in **specialized tables** that reference **Account node ids**. Design corpora stay free of Account/role nodes. Design Imp stays on design corpora; authz policy may later query the **identity** graph by Account node id.

**Use-case labels** such as “local single-operator,” “local multi-user,” and “remote multi-user” are **documentation-only**. They describe common compositions of design corpora + user corpora + auth tables + auth extensions. They are **not** first-class product modes: core packages **must not** introduce an explicit mode enum, mode flag, or mode-branched control flow. Behavior follows from what is wired (user corpora present or absent, auth tables, auth/authz providers loaded or not, design corpus backend). Tests and surface/dev helpers **may** name use cases for clarity.

This doc is the **living** agent-facing charter. Prefer it over archive roadmaps when implementing a phase.

## When to read this

- Planning or implementing multi-user, Account, authentication, authorization, SSO, or user administration
- Opening user corpora / auth specialty SQL vs design corpus cache or schema
- Writing a multi-user plan (must include **Non-multi-user package impact**)
- Deciding whether a change belongs in core vs an auth/authz extension

**Not** for: static site export multi-user (out of scope); multi-corpus sessions alone for **design** content ([multi-corpus.md](./multi-corpus.md) — analogous mixing for user corpora is chartered here); graph storage details ([tome-db.md](./tome-db.md), [graph-store.md](./graph-store.md)).

## Requirements

### Use-case shapes (implicit)

Design/content topology and identity are **independent axes**. Identity work may run on today’s flatfile→SQLite design stack; Postgres is required for remote concurrent design data, not for first identity/auth work.

These rows are **use cases**, not selectable modes in core:

| Use case (label only) | Design corpus | User corpora + auth tables | Auth |
| --- | --- | --- | --- |
| **Local single-operator (default)** | Flatfile + corpus SQLite file | None | Auth-free |
| **Local multi-user** (dev / opt-in) | Flatfile + corpus SQLite file | **User corpus** (flatfile + identity SQLite) + auth specialty tables | Present when auth extensions + identity wiring are present |
| **Remote multi-user** | **Postgres design/corpus schema** | **Postgres identity schema(s)** + auth tables | Present when auth extensions + identity wiring are present |

**Must:**

- Keep use-case labels **implicit** in core: no `mode` / `multiUser` enum or flag that packages switch on. Compose behavior from optional user-corpus / auth-table wiring, loaded auth/authz providers, and design corpus backend choice.
- When no user corpora and no auth providers are configured, Editor/HTTP **must** remain usable without identity (today’s default).
- Do **not** open or migrate user corpora or auth specialty stores unless configured.
- Tests and surface/dev settings **may** name use cases or set convenience knobs; those **must not** become core package mode APIs.

### Design corpora vs user corpora vs auth tables

Three layers — do not collapse them:

| Layer | What it holds | Physical sketch (local / remote) |
| --- | --- | --- |
| **Design corpora** | Story/design graph nodes and relationships | Flatfile + design SQLite cache; or Postgres **design/corpus** schema. See [multi-corpus.md](./multi-corpus.md) for mixing design roots. |
| **User corpora** | **Account** and **role** nodes (and identity relationships for grants/membership) | Separate identity content root(s) + identity SQLite cache; or Postgres **identity** schema(s). Same graph machinery as design, different domain. |
| **Auth specialty tables** | Sessions, IdP subject → Account node id bindings, credentials | Non-graph tables beside identity SQL (same identity cache file or adjacent file/schema). **Never** in a design corpus file/schema. |

**Must:**

- Prefer real separation of design vs identity stores over **table-name prefixes** in a shared design SQLite file.
- Treat **Account and role** as **nodes in user corpora** — not as canonical rows in auth tables, and **not** as nodes in design corpora.
- Keep **login/session/credential** data in auth specialty tables that reference **Account node ids** (`accountNodeId` on Principal / Session).
- Own design graph migrations on the design file/schema; identity graph migrations on user-corpus stores; auth-extension specialty migrations only in auth/identity SQL — never alter design corpus DDL.
- Allow **mix-and-match** of design vs identity layers (distinct paths/DSNs).
- Support **mixing user corpora** in one host/session (analogous to design multi-corpus).
- Support **sharing one user corpus across multiple design corpora / hosts** (one identity graph, many content projects).

**SQLite cross-file caveat (accepted):** indexes spanning joins across separate files / `ATTACH` are weaker. Prototype first; explore manual workarounds before merging design and identity into one file with prefixes.

**Future infrastructure (not required for charter):** composite open/migrate for user corpora; Imp/`executeImp` against the identity graph for rich authz policy. Today design Imp is corpus-bound ([graph-store.md](./graph-store.md), [tome-imp-sql.md](./tome-imp-sql.md)); Denial authorizers gate design Imp and later may consult identity by Account node id.

### Isolation (core vs extensions)

| Concern | Where it lives | Core’s job |
| --- | --- | --- |
| **Authorization (Denial)** | Built-in **deny-everything** / **allow-everything**; specialized policies via extension `authorizationModule` (mix-and-match slots); richer policies may query user-corpus Imp/relationships | **Fundamental:** Imp-query + modification **authorizer** slots; server **defaults to deny-everything**; consult on Imp + modification HTTP paths; 403 on deny. Additive — access is granted, never open-by-default. |
| **Authorization (Filtering)** | Later (prefer query mutation) | Seams when phase work lands |
| **Authorization (Probing)** | Later (UX boundary APIs) | Seams when phase work lands |
| **Authentication** | Thin **Principal + Session** vocabulary and session create/delete on the **web API**; OIDC and rich IdP flows prefer extensions | Resolve `Principal \| null` per request (`accountNodeId`). No IdP protocol logic in core. |
| **Account** | Nodes (+ lifecycle) in **user corpora**; admin UI over those nodes | Stable **Account node id** for authz (`accountNodeId`). |
| **Role** | Nodes + relationships in **user corpora** (grants to design resources via opaque design node ids / policy edges as needed) | No product ACL matrix in core; authorizers/extensions read the identity graph later. |
| **Profile** | Optional later (may hang off Account nodes) | None for current product features. |
| **User administration** | Admin UI / extension ops over Account (and role) nodes | Thin account APIs if needed; “who may administer” via authz policy. |

**Authorizer slots (Denial):** separate interfaces — `ImpQueryAuthorizer` and `ModificationAuthorizer` — not one bundled provider and not HTTP verbs. See [authorization-authorizers.md](../extensions/authorization-authorizers.md).

**Extension kinds:** `page-block`, `searcher`, `authentication-provider` ([extensions.md](./extensions.md)). Denial authorizers register via optional `authorizationModule` (host APIs), not a single megaprovider kind. Shell/admin kinds may come later.

Existing design-corpus `readonly` / `protectedNodeIds` are resource rules without identity — fold under or sit beside Denial / Filtering over time rather than a second ad-hoc ACL style in core.

### Identity domains

| Domain | Responsibility | Priority |
| --- | --- | --- |
| **Account** | Authz subject (Account **node**), ownership hooks, activity, lifecycle (active/disabled); user admin operates here | **Required** when user identity is in play |
| **Authentication** | Sessions, sign-in/out, credentials, IdP↔Account bindings; OIDC as a strategy | **Required** when user identity is in play (web API owns thin session/Principal; strategies may be extension-owned) |
| **Profile** | How a user appears to others; metadata | **Nice-to-have** — defer |

Do **not** put Account/role nodes in **design** corpora. Do **not** treat IdP subject strings as Account node ids once bindings + user corpora exist (OIDC claim → Account node id via auth specialty binding table).

### Non-multi-user package impact (standing rule)

Every multi-user implementation plan **must** include a **package impact** section: which core packages change, why, and how thinly. Prefer “authorizer call + extension policy” (later: identity-graph Imp) over new ACL matrices in `tome-db`. Prefer composition (authorizer slots, optional user corpora) over mode switches.

**Security is fundamental:** Denial consultation lives in `tome-http` / `tome-server` even for local solo. Solo stays light by **explicitly** configuring `allow-everything` (e.g. workbench config)—never by omitting the denial path or defaulting to allow in code.

**Expected skeletal core touches (program-level):** `tome-http` (Principal + sessions + Imp/modification authorizer call sites), `tome-server` (deny default + allow built-ins + authorization registry), `tome-interfaces` (authorizer contracts), extension host (OIDC / authorization modules / shell kinds as needed), optional service-interface ports, thin editor shell slots, user-corpus + auth-table open/migrate when configured, later Postgres design + identity schemas, Imp against identity graph for rich authz.

**Not expected in core:** explicit multi-user / operating-mode enums or flags, OIDC protocol implementations, rich product ACL matrices, profile product UI, Account/auth tables inside the **design** corpus SQLite/graph schema, Account as non-graph SQL rows as the canonical store.

### Out of scope

- Static-site multi-user
- Rich authorization *product* policy in `tome-db` / `tome-http` (LCD + call sites only)
- Putting Account/role nodes or auth specialty tables in **design** corpora / design schemas
- Prioritizing Profile before Account + authz + admin
- Treating local multi-user as a substitute for Postgres authoritative graph on remote
- Core “mode” settings that encode the use-case table above

## Design rationale

Without isolation, specialized IdP and product ACL concerns leak into `tome-db` and `tome-editor`. Denial machinery itself must stay fundamental in the request path once security exists—optional/fail-open authz is a footgun.

**Why additive denial:** secure baseline is deny; access is granted (allow-everything or richer authorizers). Never “open unless denied.”

**Why authorizer slots in core, policy in extensions:** call sites and fail-closed defaults are product safety; specialized who-may-do-what stays swappable without forking `tome-http`.

**Why separate Imp vs modification authorizers:** different payload families; mix and match without a bundled megainterface.

**Why Account/role as nodes in user corpora:** Imp and Tome relationships can express grants and membership without a bespoke ACL schema; admin UX can reuse graph tooling; design corpora stay free of identity pollution.

**Why not Account nodes in design corpora:** design content (Marloth, etc.) must not own login identity; multi-corpus design sessions must not fight over where users live; static/export pipelines stay clear of accounts.

**Why auth specialty tables remain:** sessions, secrets, and IdP protocol state are not good graph nodes; they reference Account node ids instead of duplicating canonical Account data.

**Why mixable / shareable user corpora:** same composition story as design multi-corpus — attach multiple identity roots when needed, or point many design hosts at one shared identity root.

**Why local identity before Postgres graph:** identity and auth can dogfood on flatfile→SQLite user corpora; remote concurrency needs SQL-authoritative design data later.

**Why implicit use cases:** an explicit mode variable invites every package to branch on “which world am I in?” Composition (authorizer grants + optional user corpora + providers + design backend) keeps solo light without a mode flag.

## Behavior / pipeline

### Composition (not mode selection)

```
Configured pieces (independently)
  → design corpora: flatfile+SQLite cache  |  Postgres design schema  |  mixed design corpora
  → user corpora: absent  |  one or more identity roots (mixable; shareable across design hosts)
  → auth specialty tables: absent  |  beside identity SQL
  → auth / authz extensions: absent  |  loaded

Resulting use case (documentation label only)
  → no user corpora, no auth → local single-operator (auth-free)
  → user corpus + auth on flatfile design → local multi-user
  → Postgres design + identity schema + auth → remote multi-user
```

### Identity → authorization (Denial)

```
Session / auth strategy → Principal { accountNodeId } (web API request scope)
                                      ↓
              Imp query authorizer  |  Modification authorizer
              (default deny-everything; allow-everything or extension grant;
               later: consult user-corpus roles/relationships)
                                      ↓
                         allow → handler  |  deny → 403 forbidden
```

**Later subdomains:** Filtering (open-ended query row visibility); Probing (UX permission-boundary APIs).

Account **nodes** live in user corpora; auth tables and (later) Profile hang off Account by node id. User admin operates on Account/role nodes.

### Phase index

Prefer citing **this doc + phase id** when starting work. Update this table when phases land or reorder.

**Order:** general authentication (including sessions) **before** authorization. Authorization is a large subject and may span multiple implementation sessions.

| Phase | Focus | Depends on |
| --- | --- | --- |
| **0 — Architecture charter** | This feature doc | — |
| **1 — General authentication** | Sign-in, **sessions**, sign-out; `Principal \| null` on the web API; testable without authorize. In-memory sessions OK; durable auth-table sessions deepen under this phase or as a follow-on within it. | 0 |
| **2 — SSO (OIDC)** | Single sign-on via OIDC on top of the authentication layer | 1 |
| **3 — Authorization** | Denial + Filtering + Probing; **spans multiple sessions** | 1 |
| **4 — User authentication page(s)** | Sign-in / sign-out UI | 1–2 |
| **5 — User account page(s)** | Account/role admin over **user corpora** (nodes); auth bindings as needed | 1, 3 |
| **6 — User profile and profile page(s)** | Profile + pages (hang off Account nodes) | 5 |
| **7 — PostgreSQL** | Better concurrency; design + separate identity schemas as needed | 0–1 (remote graph needs design schema) |

**Phase 1 progress:** web API owns `Principal` / `Session` with `accountNodeId`, in-memory `SessionStore`, `POST/DELETE /api/sessions`, `GET /api/me`, request-scoped principal via `Authorization: Session <id>`.

**Phase 2 progress:** `authentication-provider` extension kind + host routes `GET /api/auth/login` / `GET /api/auth/callback`; same-site session cookie `tome_session` (plus `Authorization: Session`); reference package `tome-auth-oidc` (auth-code + PKCE); API has **no CORS**. Editor sign-in UI remains phase 4. OIDC currently maps IdP claim → session `accountNodeId` as a **provisional stand-in** until user corpora + IdP↔Account bindings exist.

**Phase 3a progress (Denial):** separate `ImpQueryAuthorizer` + `ModificationAuthorizer`; core deny-everything (server default) and allow-everything (explicit only); wired on Imp + modification HTTP paths; workbench config explicitly sets allow-everything for light solo; extension `authorizationModule` can replace slots. Filtering, probing, catch-all for other APIs, folding `readonly` / `protectedNodeIds`, and identity-graph Imp policy remain later 3x sessions.

**Not yet implemented:** user-corpus open/migrate, Account/role type tables, composite mix of user corpora, Imp binder for identity stores, durable auth specialty SQL.

Largest surfaces: authorization (3), user corpora + account UI (5), Postgres graph (7), and auth UI / profile (4–6) — not core ACL matrices.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Living charter (use-case shapes, isolation, phase index) |
| [`tasks/multi-user-system.md`](../../tasks/multi-user-system.md) (+ related stubs) | Optional backlog pointers into this program |
| User corpora (flatfile + identity SQLite / Postgres identity schema) | Future: Account + role **nodes** and identity relationships |
| Auth specialty SQL (beside identity store) | Future: sessions, IdP↔Account bindings, credentials keyed by Account node id |
| Design corpus SQLite / Postgres design schema | Design graph only — no Account/role nodes or auth tables |

## Quick start

1. Read **Requirements** and the **phase index** for the phase you are implementing.
2. Include **Non-multi-user package impact** in the implementation plan.
3. Do not invent IdP, product ACL logic, or core mode enums/flags.

## Configuration

- Phase 1 web API sessions use an **in-memory** store by default (no config). Credentials: `Authorization: Session <sessionId>` **or** same-site cookie `tome_session` (header wins). Create body uses `{ accountNodeId }` (prototype may pass any non-empty string until user corpora enforce real Account nodes); create/delete also set/clear the cookie.
- **Same-site only:** browser clients call the API via the UI origin `/api` proxy (Vite in `editor:dev`). The application API does **not** speak CORS. OIDC `redirectUri` must be the UI-origin callback (e.g. `http://127.0.0.1:5173/api/auth/callback`). Do not point `VITE_TOME_API_URL` at the API port for cookie SSO.
- OIDC via `extensions.json` `kind: "authentication-provider"` + `authenticationModule` (at most one enabled). Reference params for `tome-auth-oidc`: `issuer`, `clientId`, `clientSecret` or `clientSecretEnv`, `redirectUri`, optional `scopes` (default `openid`), `subjectClaim` (default `sub`), `postLoginRedirect` (default `/`). See [authentication-providers.md](../extensions/authentication-providers.md). Durable path: claim → auth binding → Account node id → `createSession({ accountNodeId })`.
- Optional **user corpora** (paths/ids analogous to design `corpora`) — mixable; one corpus may be shared across design hosts.
- Optional **auth specialty** path/DSN beside identity SQL — durable sessions / IdP bindings when configured.
- Distinct **design corpus** path/DSN (already exists for content/cache; Postgres design later).
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
| `tome-http` identity | `Principal` / `Session` (`accountNodeId`), in-memory `SessionStore`, request scope, `/api/sessions`, `/api/me`, cookie + `/api/auth/*` (phases 1–2) |
| `tome-http` denial | Imp query + modification authorizer consultation; 403 `forbidden` (phase 3a) |
| `tome-interfaces/authorization` | Separate authorizer interfaces + deny/allow built-ins (`AuthorizationPrincipal.accountNodeId`) |
| Extension registry/host | `authentication-provider` (phase 2); `authorizationModule` registration (phase 3a); admin/shell kinds as needed (phases 4–5) |
| `tome-auth-oidc` | Reference OIDC auth-code + PKCE provider (provisional claim → `accountNodeId` until bindings) |
| `tome-server` | Session store; authn provider; **AuthorizationRegistry** (deny default); passes authorizers to HTTP |
| `tome-service-interfaces` | Session / authentication / authorizer ports on `TomeServiceHost`; `authorization` config |
| `tome-editor` | Shell mount points for sign-in / account / profile (phases 4–6); `/api` proxy for same-site |
| User corpora open/migrate | Future: identity graph roots (mix + share); never alter design corpus DDL |
| Auth specialty SQL | Future: sessions / IdP bindings keyed by Account node id |
| Design SQL (`tome-sqlite` / future postgres) | Design graph only (Postgres phase 7) |

## See also

- [extensions.md](./extensions.md) — kinds including authentication-provider
- [authentication-providers.md](../extensions/authentication-providers.md) — authn kind guide
- [tome-db.md](./tome-db.md) — design corpus flatfile + SQLite cache
- [graph-store.md](./graph-store.md) — graph store API (design corpus today)
- [tome-server.md](./tome-server.md) — config-driven host
- [multi-corpus.md](./multi-corpus.md) — multiple **design** content roots (orthogonal axis; analogous mixing for user corpora)
- [web-api-design.md](./web-api-design.md) — HTTP API shape (includes thin identity/session)
- Backlog: [multi-user-system.md](../../tasks/multi-user-system.md), [authorization-system.md](../../tasks/authorization-system.md), [sso-login.md](../../tasks/sso-login.md), [postgresql-support.md](../../tasks/postgresql-support.md), [independent-sql-database.md](../../tasks/independent-sql-database.md)
