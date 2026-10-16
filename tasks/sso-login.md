# SSO login

Status: implemented (phase 2 core); open for real-IdP dogfood and editor UI

## Intent

Allow users to sign in via single sign-on (e.g. OIDC) rather than Tome-only credentials, with sign-out and sessions that emit a Principal for authorization.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 2 — SSO (OIDC)** landed:

- `authentication-provider` kind + `GET /api/auth/login` / `callback`
- Same-site cookie `tome_session` + `Authorization: Session` (no CORS)
- Reference package `tome-auth-oidc` (auth-code + PKCE; mock IdP in tests)

Still open: dogfood against a real IdP, editor sign-in/out UI (phase 4).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [authentication-providers.md](../docs/extensions/authentication-providers.md)
- [multi-user-system.md](./multi-user-system.md)
- [authorization-system.md](./authorization-system.md)
