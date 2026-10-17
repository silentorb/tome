# Authorization system

Status: open (phase 3 in progress)

## Intent

Define who can read or change which corpora, nodes, and operations — with additive, fail-closed denial in core and specialized policy via extensions.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md).

**Subdomains:** Denial | Filtering | Probing.

**Phase 3a (landed):** Denial — separate `ImpQueryAuthorizer` + `ModificationAuthorizer`; core deny-everything (server default) + allow-everything (explicit); wired on Imp + modification HTTP paths; extension `authorizationModule` registration. Guide: [authorization-authorizers.md](../docs/extensions/authorization-authorizers.md).

**Remaining:** Filtering (prefer query mutation); probing APIs; catch-all / specialized authorizers for other routes; fold or align `readonly` / `protectedNodeIds`; richer product policies.

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [sso-login.md](./sso-login.md)
