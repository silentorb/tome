# Authorization authorizers (Denial)

Denial is the first authorization subdomain ([multi-user.md](../features/multi-user.md) phases 3a–3b). Filtering and probing come later.

Contracts live in `tome-interfaces/authorization`.

| Export | Role |
| --- | --- |
| `Authorizer` | Allow/deny Imp queries and graph/content modifications (`authorizeImpQuery` / `authorizeModification`) |
| `AuthorizationHost` | `registerAuthorizer` (single slot) |
| `createDenyEverythingAuthorizer` / `createAllowEverythingAuthorizer` / `createAuthorizationModelAuthorizer` | Built-in implementations |
| `NODE_EDIT_MODIFICATION_FAMILIES` | Modification families gated by the can-edit-nodes policy |

One authorizer handles both payload families. Do not split Imp vs modification into independent provider types.

## Additive / fail-closed

| Built-in id | Behavior | Default? |
| --- | --- | --- |
| `deny-everything` | Always deny | **Yes** — server default |
| `allow-everything` | Always allow | **No** — explicit config / registration only |
| `authorization-model` | Discovers Authorization Model instances; **with** a policy evaluator (user corpus + Imp→SQL): Imp queries **allow**, node-edit modifications consult can-edit-nodes; **without** evaluator: always deny | **No** — requires ontology type key |

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

For node-edit Denial (phase 3b), also configure a user corpus (`userCorpora` / `TOME_USER_CONTENT_PATH`) so Account→Permission grants sync into the shared session SQLite. The host wires `createCanEditNodesEvaluator` (`compileImpGraphToTomeSql` + `queryAll` — not `executeImp`).

## Ontology authz types

Optional `ontology.json` keys (closed `types` map):

```json
{
  "version": 1,
  "types": {
    "authorizationModel": "<authorization-model-type-table-ulid>",
    "authorizationPolicy": "<policy-type-table-ulid>"
  }
}
```

Members of `authorizationModel` are **Authorization Model** instances (containers). Members of `authorizationPolicy` are **Policy** nodes (Imp body documents the grant check). Model data carries this minimal authz footprint so authorization is not fully detachable from the corpus.

## Node-edit policy (phase 3b)

| Piece | Location |
| --- | --- |
| Account / Permission / grant edges | User corpus flatfile (fixture: `tome-server/fixtures/identity-corpus/`) |
| Policy Imp document | Design corpus under Authorization Model (Marloth) |
| Evaluation | Shared ephemeral SQLite via `compileImpGraphToTomeSql` + `queryAll` |

- **View:** `authorizeImpQuery` → allow (when evaluator wired).
- **Node edit** (`node.create` / `node.patch` / `node.delete` / `node.archive` / `node.unarchive`): allow iff principal holds **can-edit-nodes**.
- **Other modifications:** deny (fail-closed).
- **No Role nodes** yet — permissions attach directly to Accounts.

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

Ungated: `/api/health`, `/api/me`, `/api/sessions`, `/api/auth/*`. Non-Imp reads and other APIs: catch-all / specialized authorizers later. When a user corpus is configured, `POST /api/sessions` validates `accountNodeId` as an Account node (`unknown_account` on failure).
