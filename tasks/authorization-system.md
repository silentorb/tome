# Authorization system

Status: open (phase 3 in progress)

## Intent

Define who can read or change which corpora, nodes, and operations — with additive, fail-closed denial in core and specialized policy via extensions.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md).

**Subdomains:** Denial | Filtering | Probing.

**Phase 3a (landed):** Denial — single `Authorizer` (`authorizeImpQuery` + `authorizeModification`); core deny-everything (server default), allow-everything (explicit), authorization-model (ontology `types.authorizationModel`, fail-closed until policy children); wired on Imp + modification HTTP paths; extension `authorizationModule` registration (minimal config). Guide: [authorization-authorizers.md](../docs/extensions/authorization-authorizers.md).

**Remaining:** Filtering (prefer query mutation); probing APIs; catch-all / specialized authorizers for other routes; fold or align `readonly` / `protectedNodeIds`; richer product policies (including Imp against **user corpora** for role/grant relationships — see [multi-user.md](../docs/features/multi-user.md)); Authorization Model related grant/logic node types.

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [sso-login.md](./sso-login.md)
