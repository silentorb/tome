# Web API design (application-specific)

## Summary

Tome’s HTTP API is **application-specific**: it exists to power the editor (and closely related hosts), not as a general-purpose graph CRUD facade. Endpoints are shaped around **client use cases**. Each response must carry the data that use case needs so the client does not fan out follow-up requests or run storage-level transforms.

The surface is a **hybrid**: most editor use cases are **REST-shaped** (path/query-driven resources and DTOs). **Imp collection queries** are **POST-body** endpoints with a **fixed signature** per record store — not URL-driven REST, and not a command-router multiplexer.

## When to read this

Read this when adding or changing HTTP routes, graph-service methods exposed over HTTP, editor load/save payloads, or extension prepare/expand endpoints.

## Requirements

- Tome HTTP **must** be treated as an **application-specific** API (editor page load, search, table windows, mutations), not a general-purpose atomic graph API for arbitrary integrators.
- A use-case response **must** include all data needed for that use case. The client **must not** need follow-up GETs whose inputs are ids/fields discovered in the first response solely to finish rendering that use case (e.g. N× full node fetches to resolve link titles for the body being opened).
- Data transforms that turn storage forms into editor-ready structure (link parsing, title resolution, page-block expand) **must** run on the server for that use case.
- Multiple requests per page load **may** exist when they serve **separate use cases** (workspace chrome, node page, recent list, search). Do not merge unrelated use cases into one Frankenstein payload.
- Conversely, do not split one use case across chatty atomic calls when the only reason is “smaller endpoints” — distributed call overhead makes that the wrong default here.
- Exceptions **may** exist when follow-up data is a clearly separate client concern (e.g. slash-menu preview of a newly inserted page block via `POST …/prepare-editor-body`), not part of the initial page-load document.
- **Imp collection queries (POST-body, fixed signature):**
  - Imp graphs travel in the **JSON body**, not in the URL path/query or headers. Paths name the use case / record store (e.g. `POST /api/nodes/query`), not the format (`execute-imp`, `*-json`).
  - Each Imp query endpoint has **one** contract. For Tome nodes: **`imp → nodes`** — `{ graph, context? }` → `{ columns, rows }`. No `action` / `command` field that dispatches heterogeneous operations.
  - Today: `POST /api/nodes/query` (design graph). Separate store: `POST /api/debug/profiling/execute-imp` (profiling spans). Future record stores get **additional** specialized Imp query endpoints — do not fold them into `/api/nodes/query`.
  - This is **not** an editor chrome contract — responses are unassembled Imp results. Editor search/recent stay REST use cases that may call `executeImp` server-side. See [graph-store.md](./graph-store.md).
- **Other POST-body endpoints** (including command-router RPCs such as `POST /api/extensions/:id/invoke`) **may** exist when useful. The hard rule is only that Imp collection queries are never URL-driven REST and never stuffed into a generic command multiplexer.
- **Corpus naming on the public wire:** use an `Id` suffix only when a context can hold both a corpus **object** and a corpus **id** (e.g. editor `activeCorpus` beside `activeCorpusId`). Otherwise URL/JSON/service params use `corpus` / `activeCorpus`. Imp/SQL reads the unified session cache and do **not** require a corpus param.

## Design rationale

General-purpose APIs favor small atomic operations so consumers compose complex flows. That works when invocation is cheap (in-process) or when a middle tier caches and batches.

Browser → Tome HTTP pays per-request overhead (HTTP, serialization, often full page assembly). Chatty atomic calls push graph work and transforms onto the client, which then re-requests data. For an editor product API, the better default is: **use-case endpoints, server-heavy assembly, few round-trips for transforms**.

Still keep use cases separable so the editor is not one mega-RPC: workspace vs node page vs search remain distinct.

Imp is a rich query body format; putting it in GET query strings or resource CRUD is brittle. A specialized POST with a fixed `imp → <records>` signature keeps the contract clear without a command router.

## Behavior / pipeline

Example — **open node page** (`GET /api/nodes/:id`):

1. Load node + sections (tables, relations, metadata).
2. Parse Extended Markdown (storage only) into a `NodeBodyDocument` semantic tree (blocks, inlines, callouts, links, page blocks).
3. Batch-resolve dynamic-link titles; attach page-block `editorHtml`.
4. Return one payload the client maps to ProseMirror JSON without further title/body GETs or a markdown projection.

Save (`PATCH` with the same document) encodes back to Extended Markdown on the server.

## Inputs / outputs / artifacts

| Concern | Guidance |
| --- | --- |
| Storage (`content/`) | Canonical markdown / JSON on disk — not the editor wire format |
| HTTP editor DTOs | Structured for the use case (e.g. `NodeBodyDocument` on the node page) |
| Client | Arrange/project DTOs into UI; do not parse storage forms or fan out for titles |

## Verification

- New editor features that need derived graph data include that data in the relevant use-case response (or a dedicated endpoint for that use case), with tests that the client does not N+1 on ids from the first payload.
- Feature docs for editor/HTTP describe the use case and payload, not only storage shapes.

## Implementation pointers

| Area | Path |
| --- | --- |
| HTTP routes | `packages/tome-http/src/handler.ts` |
| Graph services | `packages/tome-server/src/graph-services.ts` |
| Editor client | `packages/tome-editor/src/webview/` |
| Node page DTO | `packages/tome-graph-interfaces/src/node-page-sections.ts` |

## See also

- [tome-editor.md](./tome-editor.md) — editor client and node page API
- [tome-server.md](./tome-server.md) — host and service modules
- [extensions.md](./extensions.md) — page-block prepare (insert/preview use case)
- [graph-store.md](./graph-store.md) — `executeImp` domain API and `POST /api/nodes/query`
- [multi-corpus.md](./multi-corpus.md) — corpus wire naming
