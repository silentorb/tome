# Multi-user system

Status: open

## Intent

Support more than one user on the Tome web app (Account, authentication, authorization, user administration) while keeping local single-operator auth-free by default. Content topology and identity are independent axes (local identity on flatfile→SQLite; remote concurrency needs Postgres corpus).

## Notes

Parent program for related stubs (authorization, SSO, PostgreSQL, independent SQL). Living charter and phase index: [multi-user.md](../docs/features/multi-user.md). Isolation bias: LCD authz + seams in core; auth and specialized authz in extensions; separate corpus vs user SQL stores. Use-case labels (local solo / local MU / remote MU) are **implicit** — compose from optional user store + providers + corpus backend; no core mode enum/flag.

## See also

- [multi-user.md](../docs/features/multi-user.md) — use cases, isolation, phase index
- [authorization-system.md](./authorization-system.md)
- [sso-login.md](./sso-login.md)
- [postgresql-support.md](./postgresql-support.md)
- [independent-sql-database.md](./independent-sql-database.md)
