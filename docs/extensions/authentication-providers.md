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
      // ctx.params, ctx.createSession, ctx.sessionCookieHeader
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

**Account node id:** `createSession` expects `{ accountNodeId }` — the Account **node** id in a user corpus. Until user corpora and IdP↔Account binding tables exist, `tome-auth-oidc` passes the IdP subject claim (default `sub`) as a **provisional** `accountNodeId`. The durable path is claim → auth specialty binding → Account node id → `createSession`.

## See also

- [multi-user.md](../features/multi-user.md) — phase 2 SSO; user corpora + auth tables
- [extensions.md](../features/extensions.md) — kinds and loading
- [searchers.md](./searchers.md) — similar singleton open pattern
