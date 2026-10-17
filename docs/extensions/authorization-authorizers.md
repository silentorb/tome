# Authorization authorizers (Denial)

Denial is the first authorization subdomain ([multi-user.md](../features/multi-user.md) phase 3a). Filtering and probing come later.

Contracts live in `tome-interfaces/authorization`.

| Export | Role |
| --- | --- |
| `ImpQueryAuthorizer` | Allow/deny Imp / open-ended query payloads |
| `ModificationAuthorizer` | Allow/deny graph/content modification payloads |
| `AuthorizationHost` | `registerImpQueryAuthorizer` / `registerModificationAuthorizer` (independent slots) |
| `createDenyEverything*` / `createAllowEverything*` | Built-in implementations |

Interfaces are **separate** so policies mix. Do not bundle both into one required provider type.

## Additive / fail-closed

| Built-in id | Behavior | Default? |
| --- | --- | --- |
| `deny-everything` | Always deny | **Yes** — server default for each slot |
| `allow-everything` | Always allow | **No** — explicit config / registration only |

Local solo / workbench sets both slots to `allow-everything` in server config (light runtime). That is configuration, not a core default.

## Server config

```json
{
  "authorization": {
    "impQueryAuthorizer": "allow-everything",
    "modificationAuthorizer": "allow-everything"
  }
}
```

Omitted keys → `deny-everything`.

## Extension registration

Optional `authorizationModule` on an `extensions.json` extension entry:

```ts
import type { AuthorizationHost } from "tome-interfaces/authorization";
import { createAllowEverythingImpQueryAuthorizer } from "tome-interfaces/authorization";

export function register(host: AuthorizationHost): void {
  host.registerImpQueryAuthorizer(createAllowEverythingImpQueryAuthorizer());
  // Leave modification slot unchanged, or register a custom ModificationAuthorizer.
}
```

Load order: reset to deny → apply built-in config → run authorization modules (modules may replace slots).

## HTTP behavior

| Payload family | Authorizer | On deny |
| --- | --- | --- |
| Imp query (`POST /api/nodes/query`, profiling Imp) | Imp query | `403` `{ "error": "forbidden" }` |
| Graph/content modifications | Modification | `403` `{ "error": "forbidden" }` |

Ungated: `/api/health`, `/api/me`, `/api/sessions`, `/api/auth/*`. Non-Imp reads and other APIs: catch-all / specialized authorizers later.
