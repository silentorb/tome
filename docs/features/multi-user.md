# Multi-user

## Summary

Tome’s default is a **local single-operator** product. **Multi-user** is an opt-in program for shared identity, authorization, and (for remote) **Neo4j-authoritative** design data. Core owns a **thin web-API identity/session layer** and **fundamental denial authorizers** (additive / fail-closed). **Specialized authentication strategies (e.g. OIDC) and rich authorization policies** prefer extensions. Local solo stays security-conscious with a **light grant** (explicit `allow-everything` in server config)—not a silent fail-open.

**Identity is a graph, not Account SQL rows.** Canonical Account and role data live as **nodes** (and relationships) in one or more **user corpora** — identity content roots separate from design/content corpora. Design corpora stay free of Account/role nodes. Design Imp stays on design corpora; authz policy may later query the **identity** graph by Account node id.

**Local vs remote storage (locked):** On the **local flat-file** stack, **all durable data is text** (user-corpus flat files; nodes/relationships first for Account, role, IdP bindings). Local SQLite is **ephemeral only** (shared session query cache for design + user corpora, sessions, diagnostics) — see [tome-db.md](./tome-db.md) § Local SQLite is ephemeral-only. Secrets that must not be git-shared may be **gitignored text**, still not SQLite. A **remote auth specialty store** (durable sessions/bindings/credentials keyed by Account node id, not design-graph SoT) belongs to the **remote Neo4j** composition, not to local SQLite as a durable store. Ephemeral **sessions** may use in-memory or SQLite locally and still count as non-corpus.

**Use-case labels** such as “local single-operator,” “local multi-user,” and “remote multi-user” are **documentation-only**. They describe common compositions of design corpora + user corpora + (remote) auth specialty store + auth extensions. They are **not** first-class product modes: core packages **must not** introduce an explicit mode enum, mode flag, or mode-branched control flow. Behavior follows from what is wired (user corpora present or absent, optional ephemeral session store, auth/authz providers loaded or not, design corpus backend). Tests and surface/dev helpers **may** name use cases for clarity.

This doc is the **living** agent-facing charter. Prefer it over archive roadmaps when implementing a phase.

## When to read this

- Planning or implementing multi-user, Account, authentication, authorization, SSO, or user administration
- Opening user corpora / ephemeral session stores / remote auth specialty stores vs design corpus cache or Neo4j graph
- Writing a multi-user plan (must include **Non-multi-user package impact**)
- Deciding whether a change belongs in core vs an auth/authz extension

**Not** for: static site export multi-user (out of scope); multi-corpus sessions alone for **design** content ([multi-corpus.md](./multi-corpus.md) — analogous mixing for user corpora is chartered here); graph storage details ([tome-db.md](./tome-db.md), [graph-store.md](./graph-store.md)); Neo4j adapter implementation ([neo4j-support.md](../../tasks/neo4j-support.md), sibling `tome-neo4j` repo).

## Requirements

### Use-case shapes (implicit)

Design/content topology and identity are **independent axes**. Identity work may run on today’s flatfile→SQLite design stack; Neo4j is required for remote concurrent design data, not for first identity/auth work.

These rows are **use cases**, not selectable modes in core:

| Use case (label only) | Design corpus | User corpora + auth | Auth |
| --- | --- | --- | --- |
| **Local single-operator (default)** | Flatfile + ephemeral corpus SQLite | None | Auth-free |
| **Local multi-user** (dev / opt-in) | Flatfile + shared ephemeral session SQLite | **User corpus** flatfile (synced into the **same** session SQLite); durable bindings/credentials in text (nodes/relationships first); ephemeral sessions (memory or SQLite) | Present when auth extensions + identity wiring are present |
| **Remote multi-user** | **Neo4j design/corpus graph** | **Neo4j identity graph(s)** + **auth specialty store** | Present when auth extensions + identity wiring are present |

**Must:**

- Keep use-case labels **implicit** in core: no `mode` / `multiUser` enum or flag that packages switch on. Compose behavior from optional user-corpus wiring, session store, loaded auth/authz providers, and design corpus backend choice.
- When no user corpora and no auth providers are configured, Editor/HTTP **must** remain usable without identity (today’s default).
- Do **not** open or migrate user corpora or remote auth specialty stores unless configured.
- Tests and surface/dev settings **may** name use cases or set convenience knobs; those **must not** become core package mode APIs.

### Design corpora vs user corpora vs auth storage

Three layers — do not collapse them:

| Layer | What it holds | Physical sketch (local / remote) |
| --- | --- | --- |
| **Design corpora** | Story/design graph nodes and relationships | Flatfile SoT; or Neo4j **design/corpus** graph. See [multi-corpus.md](./multi-corpus.md) for mixing design roots. |
| **User corpora** | **Account** and **role** nodes (and identity relationships for grants/membership); local first stab also IdP bindings as graph | Separate identity **flatfile** content root(s); or Neo4j **identity** graph(s). Same graph machinery as design, different domain. |
| **Auth specialty (remote)** / **ephemeral sessions (local)** | Remote: sessions, IdP↔Account bindings, credentials in a specialty store (Neo4j-friendly modeling allowed later; not design-graph SoT). Local: durable bindings/credentials in user-corpus text; sessions ephemeral (memory/SQLite) | Specialty store beside Neo4j identity graph. **Never** durable auth rows in local SQLite or in a design corpus file/graph. |

**Must:**

- Keep **durable** design vs identity as separate flatfile (or Neo4j) roots — do **not** put Account/role nodes in design corpora.
- On the **local** stack, sync design and user-corpus flatfiles into the **same ephemeral session SQLite** (corpus ownership via `locateNode` / corpus id — table mixing in the cache is fine). Do not require a second identity DB file or `ATTACH`.
- Treat **Account and role** as **nodes in user corpora** — not as canonical rows in SQL tables, and **not** as nodes in design corpora.
- Reference **Account node ids** (`accountNodeId` on Principal / Session) from sessions and from durable bindings (local: user-corpus text/graph; remote: specialty store).
- Own design graph migrations on the design file/graph; identity graph migrations on user-corpus stores; remote auth specialty migrations only in the specialty store — never alter design corpus DDL/schema for auth; never treat local SQLite as durable identity SoT.
- Allow **mix-and-match** of design vs identity **content** layers (distinct paths/URIs).
- Support **mixing user corpora** in one host/session (analogous to design multi-corpus).
- Support **sharing one user corpus across multiple design corpora / hosts** (one identity graph, many content projects).

**Future infrastructure:** richer Imp policy against Account/permission relationships in the shared cache ([tome-imp-sql.md](./tome-imp-sql.md) — prefer `compileImpGraphToTomeSql` + `queryAll`; Neo4j Imp → Cypher via sibling `imp-cypher` + `tome-neo4j`’s `tome-imp-cypher` binder — compile exists; Bolt execute later); Denial authorizers gate Imp and modifications and consult identity by Account node id.

### Isolation (core vs extensions)

| Concern | Where it lives | Core’s job |
| --- | --- | --- |
| **Authorization (Denial)** | Built-in **deny-everything** / **allow-everything** / **authorization-model**; specialized policies via extension `authorizationModule` (register only); Authorization Model type in `ontology.json`; richer policies may query user-corpus Imp/relationships later | **Fundamental:** single **Authorizer** (`authorizeImpQuery` + `authorizeModification`); server **defaults to deny-everything**; consult on Imp + modification HTTP paths; 403 on deny. Additive — access is granted, never open-by-default. |
| **Authorization (Filtering)** | Later (prefer query mutation) | Seams when phase work lands |
| **Authorization (Probing)** | Later (UX boundary APIs) | Seams when phase work lands |
| **Authentication** | Thin **Principal + Session** vocabulary and session create/delete on the **web API**; OIDC and rich IdP flows prefer extensions | Resolve `Principal \| null` per request (`accountNodeId`). No IdP protocol logic in core. |
| **Account** | Nodes (+ lifecycle) in **user corpora**; admin UI over those nodes | Stable **Account node id** for authz (`accountNodeId`). |
| **Role** | Nodes + relationships in **user corpora** (grants to design resources via opaque design node ids / policy edges as needed) | No product ACL matrix in core; authorizers/extensions read the identity graph later. |
| **Profile** | Optional later (may hang off Account nodes) | None for current product features. |
| **User administration** | Admin UI / extension ops over Account (and role) nodes | Thin account APIs if needed; “who may administer” via authz policy. |

**Authorizer (Denial):** one `Authorizer` interface with Imp-query and modification methods — not HTTP verbs. Server selects the implementation; `ontology.json` may declare `types.authorizationModel` when using `authorization-model` (optional on solo design corpora). See [authorization-authorizers.md](../extensions/authorization-authorizers.md).

**Extension kinds:** `page-block`, `searcher`, `authentication-provider` ([extensions.md](./extensions.md)). Denial authorizers register via optional `authorizationModule` (host APIs) with minimal config. Shell/admin kinds may come later.

Existing design-corpus `readonly` / `protectedNodeIds` are resource rules without identity — fold under or sit beside Denial / Filtering over time rather than a second ad-hoc ACL style in core.

### Identity domains

| Domain | Responsibility | Priority |
| --- | --- | --- |
| **Account** | Authz subject (Account **node**), ownership hooks, activity, lifecycle (active/disabled); user admin operates here | **Required** when user identity is in play |
| **Authentication** | Sessions, sign-in/out, credentials, IdP↔Account bindings; OIDC as a strategy | **Required** when user identity is in play (web API owns thin session/Principal; strategies may be extension-owned) |
| **Profile** | How a user appears to others; metadata | **Nice-to-have** — defer |

Do **not** put Account/role nodes in **design** corpora. Do **not** treat IdP subject strings as Account node ids once bindings + user corpora exist (OIDC claim → Account node id via user-corpus binding locally, or remote specialty store).

### Non-multi-user package impact (standing rule)

Every multi-user implementation plan **must** include a **package impact** section: which core packages change, why, and how thinly. Prefer “authorizer call + extension policy” (later: identity-graph Imp) over new ACL matrices in `tome-db`. Prefer composition (authorizer slots, optional user corpora) over mode switches.

**Security is fundamental:** Denial consultation lives in `tome-http` / `tome-server` even for local solo. Solo stays light by **explicitly** configuring `allow-everything` (e.g. workbench config)—never by omitting the denial path or defaulting to allow in code.

**Expected skeletal core touches (program-level):** `tome-http` (Principal + sessions + Imp/modification authorizer call sites), `tome-server` (deny default + allow built-ins + authorization registry), `tome-interfaces` (authorizer contracts), extension host (OIDC / authorization modules / shell kinds as needed), optional service-interface ports, thin editor shell slots, user-corpus open/migrate when configured, later Neo4j design + identity graphs + specialty store (packages in sibling `tome-neo4j`), Imp against identity graph for rich authz.

**Not expected in core:** explicit multi-user / operating-mode enums or flags, OIDC protocol implementations, rich product ACL matrices, profile product UI, Account/auth tables inside the **design** corpus SQLite/graph schema, durable Account/bindings in local SQLite, Account as non-graph SQL rows as the local canonical store, a hard dependency from tome core on Neo4j (adapters live in `tome-neo4j` and load via `dataStores`).

### Out of scope

- Static-site multi-user
- Rich authorization *product* policy in `tome-db` / `tome-http` (LCD + call sites only)
- Putting Account/role nodes or durable auth specialty data in **design** corpora / design graphs
- Using local SQLite as the durable home for identity or auth bindings
- Prioritizing Profile before Account + authz + admin
- Treating local multi-user as a substitute for Neo4j authoritative graph on remote
- Prioritizing a PostgreSQL adapter before Neo4j (Postgres remains optional / much later)
- Core “mode” settings that encode the use-case table above

## Design rationale

Without isolation, specialized IdP and product ACL concerns leak into `tome-db` and `tome-editor`. Denial machinery itself must stay fundamental in the request path once security exists—optional/fail-open authz is a footgun.

**Why additive denial:** secure baseline is deny; access is granted (allow-everything or richer authorizers). Never “open unless denied.”

**Why authorizer selection in core, policy swappable:** call sites and fail-closed defaults are product safety; specialized who-may-do-what stays swappable without forking `tome-http`.

**Why one Authorizer with two methods:** Imp and modification are different payload families on one coherent policy surface — independent slots proved impractical.

**Why Authorization Model types in ontology.json:** treating authz as fully detachable extension-only config is insecure in practice; the corpus model should carry at least a minimal authz type root.

**Why Account/role as nodes in user corpora:** Imp and Tome relationships can express grants and membership without a bespoke ACL schema; admin UX can reuse graph tooling; design corpora stay free of identity pollution.

**Why not Account nodes in design corpora:** design content (Marloth, etc.) must not own login identity; multi-corpus design sessions must not fight over where users live; static/export pipelines stay clear of accounts.

**Why local durable auth is flat-file (nodes first):** the flat-file product requires text as SoT; SQLite is git-hostile and wipeable as cache. Prefer IdP bindings (and similar) as user-corpus nodes/relationships; gitignored text for secrets that must not be shared. Ephemeral sessions stay memory/SQLite.

**Why remote auth specialty store remains:** sessions, secrets, and IdP protocol state often fit a specialty store better than design-graph nodes; they reference Account node ids instead of duplicating canonical Account data. Modeling may be Neo4j-friendly later; that path does not apply to local SQLite as durable storage. A PostgreSQL specialty/SQL adapter is optional and much later — not required for remote multi-user.

**Why Neo4j for remote graph:** Tome’s nodes and relationships map naturally to a property graph; concurrent remote design + identity belong in Neo4j (sibling `tome-neo4j` packages / store modules), not in core’s light SQLite cache path.

**Why mixable / shareable user corpora:** same composition story as design multi-corpus — attach multiple identity roots when needed, or point many design hosts at one shared identity root.

**Why local identity before Neo4j graph:** identity and auth can dogfood on user-corpus flatfile synced into the shared ephemeral session SQLite; remote concurrency needs Neo4j-authoritative design data later.

**Why one ephemeral SQLite for design + user corpora:** SQLite is cache-only; durable separation is the flatfile roots. A single session DB avoids `ATTACH` and lets Denial Imp policies query grants without a second handle.

**Why implicit use cases:** an explicit mode variable invites every package to branch on “which world am I in?” Composition (authorizer grants + optional user corpora + providers + design backend) keeps solo light without a mode flag.

## Behavior / pipeline

### Composition (not mode selection)

```
Configured pieces (independently)
  → design corpora: flatfile+ephemeral SQLite cache  |  Neo4j design graph  |  mixed design corpora
  → user corpora: absent  |  one or more identity roots (mixable; shareable across design hosts)
  → sessions: absent  |  ephemeral memory/SQLite (local)  |  specialty store (remote)
  → durable bindings/credentials: user-corpus text (local)  |  specialty store (remote)
  → auth / authz extensions: absent  |  loaded

Resulting use case (documentation label only)
  → no user corpora, no auth → local single-operator (auth-free)
  → user corpus + auth on flatfile design → local multi-user
  → Neo4j design + identity graph + auth specialty store → remote multi-user
```

### Identity → authorization (Denial)

```
Session / auth strategy → Principal { accountNodeId } (web API request scope)
                                      ↓
                         Authorizer (Imp + modification methods)
              (default deny-everything; allow-everything / authorization-model
               / extension grant; later: consult user-corpus roles/relationships)
                                      ↓
                         allow → handler  |  deny → 403 forbidden
```

**Later subdomains:** Filtering (open-ended query row visibility); Probing (UX permission-boundary APIs).

Account **nodes** live in user corpora; sessions / bindings / (later) Profile hang off Account by node id. User admin operates on Account/role nodes.

### Phase index

Prefer citing **this doc + phase id** when starting work. Update this table when phases land or reorder.

**Order:** general authentication (including sessions) **before** authorization. Authorization is a large subject and may span multiple implementation sessions.

| Phase | Focus | Depends on |
| --- | --- | --- |
| **0 — Architecture charter** | This feature doc | — |
| **1 — General authentication** | Sign-in, **sessions**, sign-out; `Principal \| null` on the web API; testable without authorize. In-memory sessions OK; optional ephemeral SQLite session store later (still not corpus SoT). | 0 |
| **2 — SSO (OIDC)** | Single sign-on via OIDC on top of the authentication layer | 1 |
| **3 — Authorization** | Denial + Filtering + Probing; **spans multiple sessions** | 1 |
| **4 — User authentication page(s)** | Sign-in / sign-out UI | 1–2 |
| **5 — User account page(s)** | Account/role admin over **user corpora** (nodes); auth bindings as needed | 1, 3 |
| **6 — User profile and profile page(s)** | Profile + pages (hang off Account nodes) | 5 |
| **7 — Neo4j** | Better concurrency; design + separate identity graphs + auth specialty store as needed (packages in `tome-neo4j`) | 0–1 (remote graph needs design store) |

**Phase 1 progress:** web API owns `Principal` / `Session` with `accountNodeId`, in-memory `SessionStore`, `POST/DELETE /api/sessions`, `GET /api/me`, request-scoped principal via `Authorization: Session <id>`.

**Phase 2 progress:** `authentication-provider` extension kind + host routes `GET /api/auth/login` / `GET /api/auth/callback`; same-site session cookie `tome_session` (plus `Authorization: Session`); reference package `tome-auth-oidc` (auth-code + PKCE); API has **no CORS**. Editor sign-in UI remains phase 4. When a user corpus declares `types.idpBinding`, OIDC resolves `(issuer, subject)` → Account via Imp→SQL on the session cache (`resolveAccountNodeId`); unbound subjects get `403 unbound_identity`. Without that ontology key, OIDC keeps the provisional claim → `accountNodeId` fallback.

**Phase 3a progress (Denial):** single `Authorizer` (Imp + modification methods); core deny-everything (server default), allow-everything (explicit), and authorization-model (ontology-backed, fail-closed until policy children); wired on Imp + modification HTTP paths; workbench config explicitly sets allow-everything for light solo; extension `authorizationModule` can replace the authorizer. Filtering, probing, catch-all for other APIs, folding `readonly` / `protectedNodeIds` remain later 3x sessions.

**Phase 3b progress (user corpus + node-edit policy):** opt-in user flatfile corpus via `userCorpora` / `TOME_USER_CONTENT_PATH` (corpus id `identity`), synced into the shared session SQLite; Account + Permission fixture; session create validates Account membership when identity is configured; `authorization-model` allows Imp views and allows node modifications when an Imp policy (compiled to SQL) shows the principal holds **can-edit-nodes**. No Role nodes yet (permissions attach directly to Accounts). Design corpora such as marloth-story omit authz ontology keys and stay on workbench `allow-everything`; Denial dogfood for `authorization-model` lives in tome tests/fixtures for now.

**Phase 3b+ progress (local IdP bindings):** identity fixture includes IdP Binding type table + Account↔Binding edges; `ontology.json` `types.idpBinding`; host resolves claims on the shared SQL cache (not flatfile walks). Auth-hook `createSession` also validates Account membership when identity is configured.

**Not yet implemented:** Role nodes, composite mix of multiple user corpora, remote auth specialty store, Neo4j design/identity adapters.

Largest surfaces: authorization (3), user corpora + account UI (5), Neo4j graph (7), and auth UI / profile (4–6) — not core ACL matrices.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| This doc | Living charter (use-case shapes, isolation, phase index) |
| [`tasks/multi-user-system.md`](../../tasks/multi-user-system.md) (+ related stubs) | Optional backlog pointers into this program |
| User corpora (flatfile synced into shared ephemeral session SQLite / Neo4j identity graph) | Account + permission **nodes** and grant relationships (roles later; local bindings as graph/text first) |
| Ephemeral sessions (local memory/SQLite) | Present (in-memory); optional SQLite session store later |
| Auth specialty store (remote) | Future: sessions, IdP↔Account bindings, credentials keyed by Account node id |
| Design corpus SQLite / Neo4j design graph | Design graph only — no Account/role nodes or durable auth |

## Quick start

1. Read **Requirements** and the **phase index** for the phase you are implementing.
2. Include **Non-multi-user package impact** in the implementation plan.
3. Do not invent IdP, product ACL logic, or core mode enums/flags.

## Configuration

- Phase 1 web API sessions use an **in-memory** store by default (no config). Credentials: `Authorization: Session <sessionId>` **or** same-site cookie `tome_session` (header wins). Create body uses `{ accountNodeId }` (prototype may pass any non-empty string until user corpora enforce real Account nodes); create/delete also set/clear the cookie.
- **Same-site only:** browser clients call the API via the UI origin `/api` proxy (Vite in `editor:dev`). The application API does **not** speak CORS. OIDC `redirectUri` must be the UI-origin callback (e.g. `http://127.0.0.1:5173/api/auth/callback`). Do not point `VITE_TOME_API_URL` at the API port for cookie SSO.
- OIDC via `extensions.json` `kind: "authentication-provider"` + `authenticationModule` (at most one enabled). Reference params for `tome-auth-oidc`: `issuer`, `clientId`, `clientSecret` or `clientSecretEnv`, `redirectUri`, optional `scopes` (default `openid`), `subjectClaim` (default `sub`), `postLoginRedirect` (default `/`). See [authentication-providers.md](../extensions/authentication-providers.md). Durable path: claim → user-corpus IdP Binding (local flatfile SoT, resolved via session SQL cache) or specialty store (remote) → Account node id → `createSession({ accountNodeId })`. User corpora declare the binding type table with `ontology.json` `types.idpBinding`.
- Optional **user corpora**: `userCorpora` on `tome-server.json` and/or `TOME_USER_CONTENT_PATH` (single root → corpus id `identity`). Merged into the same `dataStores` / session SQLite as design corpora. Fixture: `packages/tome-server/fixtures/identity-corpus/`.
- Optional **ephemeral session** store (memory today; SQLite later, still not corpus SoT). Remote: auth specialty URI beside identity graph.
- Distinct **design corpus** path/URI (already exists for content/cache; Neo4j design later via `tome-neo4j` store modules).
- **Denial authorizer** in `tome-server.json` `authorization`:
  - `implementationId`: `"deny-everything"` \| `"allow-everything"` \| `"authorization-model"` (omitted → **deny-everything**)
  - Local/dev light grant: `"allow-everything"` explicitly on the package default ([tome-server.json](../../packages/tome-server/config/tome-server.json), used when `TOME_SERVER_CONFIG` is unset — including workbench multi-corpus via `TOME_CORPORA`) and on solo ([tome-server.workbench.json](../../packages/tome-server/config/tome-server.workbench.json)).
  - `authorization-model` requires `ontology.json` `types.authorizationModel` in at least one corpus (test fixtures today; not marloth-story).
  - Extension `authorizationModule` may replace the authorizer after built-ins apply. See [authorization-authorizers.md](../extensions/authorization-authorizers.md).

No core multi-user / operating-mode enable flag. Surface/dev or test helpers may still expose labeled presets; they are not package APIs.

## Verification

Phase 0 is documentation only. Phase 1+: full verify for affected repos + dependents per workbench `AGENTS.md` § Plan verification; reason about `.github/workflows/container.yml` when server/Docker/entrypoint changes. Denial tests should prove default deny, explicit allow, and that one authorizer drives both Imp and modification families. Neo4j adapter work verifies in the sibling `tome-neo4j` repo (heavy Neo4j Community sidecar), not in tome’s light weighted suite by default.

## Implementation pointers

| Area | Role |
| --- | --- |
| `tome-http` identity | `Principal` / `Session` (`accountNodeId`), in-memory `SessionStore`, request scope, `/api/sessions`, `/api/me`, cookie + `/api/auth/*` (phases 1–2) |
| `tome-http` denial | Single authorizer consultation (Imp + modification); 403 `forbidden` (phase 3a) |
| `tome-interfaces/authorization` | `Authorizer` + deny/allow/authorization-model built-ins (`AuthorizationPrincipal.accountNodeId`) |
| Extension registry/host | `authentication-provider` (phase 2); `authorizationModule` registration (phase 3a); admin/shell kinds as needed (phases 4–5) |
| `tome-auth-oidc` | Reference OIDC auth-code + PKCE provider (`resolveAccountNodeId` when present; provisional claim fallback otherwise) |
| `tome-server` | Session store; authn provider; IdP binding resolve (Imp→SQL); **AuthorizationRegistry** (deny default); passes authorizer to HTTP |
| `tome-service-interfaces` | Session / authentication / authorizer ports on `TomeServiceHost`; `authorization.implementationId` config |
| `tome-editor` | Shell mount points for sign-in / account / profile (phases 4–6); `/api` proxy for same-site |
| User corpora open/migrate | Identity flatfile roots (mix + share later); never alter design corpus DDL; local durable identity is flatfile |
| Auth specialty store | Future **remote**: sessions / IdP bindings keyed by Account node id |
| Design store (`tome-sqlite` / future `tome-neo4j`) | Local: ephemeral design cache; Neo4j phase 7: authoritative design graph (sibling repo) |

## See also

- [extensions.md](./extensions.md) — kinds including authentication-provider
- [authentication-providers.md](../extensions/authentication-providers.md) — authn kind guide
- [tome-db.md](./tome-db.md) — design corpus flatfile + SQLite cache
- [graph-store.md](./graph-store.md) — graph store API (design corpus today)
- [tome-server.md](./tome-server.md) — config-driven host
- [multi-corpus.md](./multi-corpus.md) — multiple **design** content roots (orthogonal axis; analogous mixing for user corpora)
- [web-api-design.md](./web-api-design.md) — HTTP API shape (includes thin identity/session)
- Backlog: [multi-user-system.md](../../tasks/multi-user-system.md), [authorization-system.md](../../tasks/authorization-system.md), [sso-login.md](../../tasks/sso-login.md), [neo4j-support.md](../../tasks/neo4j-support.md), [postgresql-support.md](../../tasks/postgresql-support.md) (deferred), [independent-sql-database.md](../../tasks/independent-sql-database.md)
