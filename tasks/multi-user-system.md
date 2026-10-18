# Multi-user system

Status: open

## Intent

Support more than one user on the Tome web app (Account, authentication, authorization, user administration) while keeping local single-operator auth-free by default. Design corpora and identity (user corpora) are independent axes; Account/role are nodes in user corpora; local durable identity is flatfile (ephemeral SQLite only); remote auth specialty store references Account node ids.

## Notes

Parent program for related stubs (authorization, SSO, Neo4j, independent non-flatfile store). Living charter and phase index: [multi-user.md](../docs/features/multi-user.md). Isolation bias: LCD authz + seams in core; auth and specialized authz in extensions; design corpora vs **user corpora** vs remote auth specialty store. Use-case labels (local solo / local MU / remote MU) are **implicit** — compose from optional user corpora + providers + design backend; no core mode enum/flag.

## See also

- [multi-user.md](../docs/features/multi-user.md) — use cases, isolation, phase index
- [authorization-system.md](./authorization-system.md)
- [sso-login.md](./sso-login.md)
- [neo4j-support.md](./neo4j-support.md)
- [postgresql-support.md](./postgresql-support.md) (deferred)
- [independent-sql-database.md](./independent-sql-database.md)
