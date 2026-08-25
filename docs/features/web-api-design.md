# Web API design (application-specific)

## Summary

Tome’s HTTP API is **application-specific**: it exists to power the editor (and closely related hosts), not as a general-purpose graph CRUD facade. Endpoints are shaped around **client use cases**. Each response must carry the data that use case needs so the client does not fan out follow-up requests or run storage-level transforms.

## When to read this

Read this when adding or changing HTTP routes, graph-service methods exposed over HTTP, editor load/save payloads, or extension prepare/expand endpoints.

## Requirements

- Tome HTTP **must** be treated as an **application-specific** API (editor page load, search, table windows, mutations), not a general-purpose atomic graph API for arbitrary integrators.
- A use-case response **must** include all data needed for that use case. The client **must not** need follow-up GETs whose inputs are ids/fields discovered in the first response solely to finish rendering that use case (e.g. N× full node fetches to resolve link titles for the body being opened).
- Data transforms that turn storage forms into editor-ready structure (link parsing, title resolution, page-block expand) **must** run on the server for that use case.
- Multiple requests per page load **may** exist when they serve **separate use cases** (workspace chrome, node page, recent list, search). Do not merge unrelated use cases into one Frankenstein payload.
- Conversely, do not split one use case across chatty atomic calls when the only reason is “smaller endpoints” — distributed call overhead makes that the wrong default here.
- Exceptions **may** exist when follow-up data is a clearly separate client concern (e.g. slash-menu preview of a newly inserted page block via `POST …/prepare-editor-body`), not part of the initial page-load document.
- **Integrator escape hatch:** `POST /api/graph/execute-imp` exposes raw **`executeImp`** (`{ graph, context? }` → `{ columns, rows }`) for tools that need collection queries without editor use-case assembly. This is **not** an editor contract — responses are unassembled Imp results, not node pages or table DTOs. See [graph-store.md](./graph-store.md).

## Design rationale

General-purpose APIs favor small atomic operations so consumers compose complex flows. That works when invocation is cheap (in-process) or when a middle tier caches and batches.

Browser → Tome HTTP pays per-request overhead (HTTP, serialization, often full page assembly). Chatty atomic calls push graph work and transforms onto the client, which then re-requests data. For an editor product API, the better default is: **use-case endpoints, server-heavy assembly, few round-trips for transforms**.

Still keep use cases separable so the editor is not one mega-RPC: workspace vs node page vs search remain distinct.

## Behavior / pipeline

Example — **open node page** (`GET /api/nodes/:id`):

1. Load node + sections (tables, relations, metadata).
2. Parse storage markdown into a structured body document (prose / links / page blocks).
3. Batch-resolve dynamic-link titles; expand page blocks for the editor.
4. Return one payload the client can project into Milkdown without further title/body GETs.

Save (`PUT` with the same document shape) encodes back to storage on the server.

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
