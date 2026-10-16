# SSO login

Status: open

## Intent

Allow users to sign in via single sign-on (e.g. OIDC) rather than Tome-only credentials, with sign-out and sessions that emit a Principal for authorization.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 5** — SSO as an **authentication extension** capability (not IdP logic in `tome-http`). Depends on auth extension seams and Account store (**phases 1–4**). Provider choice is deferred to implementation.

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [authorization-system.md](./authorization-system.md)
