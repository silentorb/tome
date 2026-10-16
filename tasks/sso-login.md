# SSO login

Status: open

## Intent

Allow users to sign in via single sign-on (e.g. OIDC) rather than Tome-only credentials, with sign-out and sessions that emit a Principal for authorization.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 2 — SSO (OIDC)** on top of the general authentication layer (phase 1 sessions / Principal). Prefer extension-owned IdP flows rather than baking OIDC into `tome-http`. Provider choice is deferred to implementation.

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [authorization-system.md](./authorization-system.md)
