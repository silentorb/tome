# Searchers

Integration contracts for **searcher** extension components live in `tome-interfaces/search`.

| Subpath | Role |
| --- | --- |
| `tome-interfaces/search` | `TomeSearch`, `SearcherHost.registerSearcher`, request/hit types |

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
      };
    },
  });
}
```

## Config

```json
{
  "id": "my-search",
  "enabled": true,
  "searcherModule": "my-package/search"
}
```

```json
{
  "id": "my-search.searcher",
  "extensionId": "my-search",
  "kind": "searcher",
  "implementationId": "my-searcher",
  "label": "My search",
  "enabled": true,
  "params": { "dataStoreId": "fts" }
}
```

`slashMenu` is not allowed on searcher components. Exactly one enabled searcher may be active.

See [search.md](../features/search.md).
