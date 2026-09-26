# Searchers

Integration contracts for **searcher** extension components live in `tome-interfaces/search`.

| Subpath | Role |
| --- | --- |
| `tome-interfaces/search` | `TomeSearch`, `SearchRole`, `SearcherHost.registerSearcher`, request/hit types |

## Register

```ts
import type { SearcherHost } from "tome-interfaces/search";

export function register(host: SearcherHost): void {
  host.registerSearcher({
    implementationId: "my-searcher",
    open(ctx) {
      // ctx.params, ctx.host?.getQueryCache(), ctx.host?.getSearcherBackend(id)
      return {
        search(request) {
          return [];
        },
        searchWindow(request) {
          return { hits: [], total: 0 };
        },
      };
    },
  });
}
```

## Config

Enable one or more searcher components, then bind **roles** (`title` / `content`) to component ids. The same id may fill both roles.

```json
{
  "version": 1,
  "search": {
    "title": "tome-search-like.searcher",
    "content": "tome-search-sqlite.searcher"
  },
  "extensions": [
    {
      "id": "tome-search-like",
      "enabled": true,
      "searcherModule": "tome-search-like/search"
    },
    {
      "id": "tome-search-sqlite",
      "enabled": true,
      "searcherModule": "tome-search-sqlite/search"
    }
  ],
  "components": [
    {
      "id": "tome-search-like.searcher",
      "extensionId": "tome-search-like",
      "kind": "searcher",
      "implementationId": "tome-search-like",
      "label": "SQL LIKE title search",
      "enabled": true
    },
    {
      "id": "tome-search-sqlite.searcher",
      "extensionId": "tome-search-sqlite",
      "kind": "searcher",
      "implementationId": "tome-search-sqlite",
      "label": "SQLite FTS5 search",
      "enabled": true,
      "params": { "dataStoreId": "fts" }
    }
  ]
}
```

When `search` is omitted and exactly one searcher is enabled, both roles bind to it. Multiple enabled searchers without `search` fail at load.

`slashMenu` is not allowed on searcher components.

See [search.md](../features/search.md).
