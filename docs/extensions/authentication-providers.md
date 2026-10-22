# Authentication providers

Integration contracts for **authentication-provider** extension components live in `tome-interfaces/authentication`.

| Subpath | Role |
| --- | --- |
| `tome-interfaces/authentication` | `AuthenticationProvider`, `AuthenticationHost.registerAuthenticationProvider`, open context |

## Register

```ts
import type { AuthenticationHost } from "tome-interfaces/authentication";

export function register(host: AuthenticationHost): void {
  host.registerAuthenticationProvider({
    implementationId: "my-auth",
    open(ctx) {
      // ctx.params, ctx.createSession, ctx.sessionCookieHeader,
      // optional ctx.resolveAccountNodeId({ issuer, subject })
      return {
        beginLogin(req) {
          return Response.redirect("…");
        },
        handleCallback(req) {
          return Response.redirect("/");
        },
      };
    },
  });
}
```

## Config

At most **one** enabled `authentication-provider`. Zero means auth-free (phase 1 prototype sessions still work). Multiple enabled providers fail at load.

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "tome-auth-oidc",
      "enabled": true,
      "authenticationModule": "tome-auth-oidc/authentication",
      "params": {
        "issuer": "https://idp.example",
        "clientId": "tome",
        "clientSecretEnv": "TOME_OIDC_CLIENT_SECRET",
        "redirectUri": "http://127.0.0.1:5173/api/auth/callback",
        "scopes": "openid",
        "subjectClaim": "sub",
        "postLoginRedirect": "/"
      }
    }
  ],
  "components": [
    {
      "id": "tome-auth-oidc",
      "extensionId": "tome-auth-oidc",
      "kind": "authentication-provider",
      "implementationId": "tome-auth-oidc",
      "label": "OIDC",
      "enabled": true
    }
  ]
}
```

`slashMenu` and `roles` are not allowed on authentication-provider components.

## Host routes

When a provider is open, the web API delegates:

| Route | Behavior |
| --- | --- |
| `GET /api/auth/login` | `provider.beginLogin` |
| `GET /api/auth/callback` | `provider.handleCallback` |

Absent provider → `404` `{ error: "authentication_not_configured" }`.

## Same-site (no CORS)

Browser clients must use the **UI origin** `/api` proxy (Vite in local `editor:dev`). OIDC `redirectUri` must be that same origin (e.g. `http://127.0.0.1:5173/api/auth/callback`) so the session cookie binds to the site the editor already uses. Pointing `VITE_TOME_API_URL` at the API port is unsupported for cookie SSO.

## Reference implementation

`tome-auth-oidc` — generic OIDC authorization code + PKCE. Tests use an in-process mock IdP.

**Account node id:** `createSession` expects `{ accountNodeId }` — the Account **node** id in a user corpus.

When the host configures a user corpus whose `ontology.json` declares **`types.idpBinding`**, open context includes **`resolveAccountNodeId({ issuer, subject })`**. That resolver runs Imp→SQL against the **shared session cache** (flatfile SoT hydrates the cache; do not walk flatfile for this lookup). `tome-auth-oidc` calls it with the configured OIDC `issuer` and subject claim; unbound → `403` `{ error: "unbound_identity" }`. Auth-hook `createSession` also rejects non-Account ids with `unknown_account` when identity validation is wired.

Without `resolveAccountNodeId` (no user corpus / no `types.idpBinding`), `tome-auth-oidc` keeps the **provisional** path: subject claim → `accountNodeId`. Remote specialty-store bindings remain future work.

Identity fixture: `packages/tome-server/fixtures/identity-corpus/` (IdP Binding type table, Alice sample binding, `types.idpBinding`).

## See also

- [multi-user.md](../features/multi-user.md) — SSO; user corpora + local IdP bindings / remote auth specialty store
- [ontology.md](../features/ontology.md) — `types.idpBinding`
- [extensions.md](../features/extensions.md) — kinds and loading
- [searchers.md](./searchers.md) — similar singleton open pattern
