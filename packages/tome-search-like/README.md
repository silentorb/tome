# tome-search-like

SQL **LIKE** title searcher (`implementationId: "tome-search-like"`).

Filters via query-cache title `LIKE`, then ranks with exact → prefix → word-boundary → substring. No body matches; no separate FTS index.

Feature spec: [`docs/features/search.md`](../../docs/features/search.md).
