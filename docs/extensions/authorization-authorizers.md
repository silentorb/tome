# Authorization authorizers (Denial)

Denial is the first authorization subdomain ([multi-user.md](../features/multi-user.md) phase 3a). Filtering and probing come later.

Contracts live in `tome-interfaces/authorization`.

| Export | Role |
| --- | --- |
| `Authorizer` | Allow/deny Imp queries and graph/content modifications (`authorizeImpQuery` / `authorizeModification`) |
| `AuthorizationHost` | `registerAuthorizer` (single slot) |
| `createDenyEverythingAuthorizer` / `createAllowEverythingAuthorizer` / `createAuthorizationModelAuthorizer` | Built-in implementations |

One authorizer handles both payload families. Do not split Imp vs modification into independent provider types.

## Additive / fail-closed

| Built-in id | Behavior | Default? |
| --- | --- | --- |
| `deny-everything` | Always deny | **Yes** — server default |
| `allow-everything` | Always allow | **No** — explicit config / registration only |
| `authorization-model` | Reads `ontology.json` `types.authorizationModel`; discovers model instances; **always denies** until policy child nodes exist | **No** — requires ontology type key |

Local solo / workbench sets `implementationId` to `allow-everything` in server config (light runtime). That is configuration, not a core default.

## Server config

Heterogeneous selection object on `tome-server.json` (not type ULIDs — those live in ontology):

```json
{
  "authorization": {
    "implementationId": "allow-everything"
  }
}
```

```json
{
  "authorization": {
    "implementationId": "authorization-model"
  }
}
```

Omitted `authorization` → `deny-everything`. Selecting `authorization-model` requires `types.authorizationModel` in at least one corpus `ontology.json` or startup fails with a clear error.

## Ontology authz types

Optional `ontology.json` key (closed `types` map):

```json
{
  "version": 1,
  "types": {
    "authorizationModel": "<authorization-model-type-table-ulid>"
  }
}
```

Members of that type-table are **Authorization Model** instances (containers). Mixing multiple models = multiple instances. Related grant/logic nodes are future work. Model data carries this minimal authz footprint so authorization is not fully detachable from the corpus.

## Extension registration

Optional `authorizationModule` on an `extensions.json` extension entry — **register only** (no Authorization Model ULID in extension params):

```ts
import type { AuthorizationHost } from "tome-interfaces/authorization";
import { createAllowEverythingAuthorizer } from "tome-interfaces/authorization";

export function register(host: AuthorizationHost): void {
  host.registerAuthorizer(createAllowEverythingAuthorizer());
}
```

Load order: reset to deny → apply built-in config → run authorization modules (modules may replace the authorizer).

## HTTP behavior

| Payload family | Method | On deny |
| --- | --- | --- |
| Imp query (`POST /api/nodes/query`, profiling Imp) | `authorizeImpQuery` | `403` `{ "error": "forbidden" }` |
| Graph/content modifications | `authorizeModification` | `403` `{ "error": "forbidden" }` |

Ungated: `/api/health`, `/api/me`, `/api/sessions`, `/api/auth/*`. Non-Imp reads and other APIs: catch-all / specialized authorizers later.
