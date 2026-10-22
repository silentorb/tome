# Authorization system

Status: open (phase 3 in progress)

## Intent

Define who can read or change which corpora, nodes, and operations — with additive, fail-closed denial in core and specialized policy via extensions.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md).

**Subdomains:** Denial | Filtering | Probing.

**Phase 3a (landed):** Denial — single `Authorizer` (`authorizeImpQuery` + `authorizeModification`); core deny-everything (server default), allow-everything (explicit), authorization-model (ontology `types.authorizationModel`); wired on Imp + modification HTTP paths; extension `authorizationModule` registration (minimal config). Guide: [authorization-authorizers.md](../docs/extensions/authorization-authorizers.md).

**Phase 3b (landed):** Opt-in user flatfile corpus (`userCorpora` / `TOME_USER_CONTENT_PATH`) synced into the **shared** ephemeral session SQLite; Account + Permission + direct grants (no Roles yet); session Account validation; `authorization-model` + can-edit-nodes Imp policy via `compileImpGraphToTomeSql` + `queryAll` (not `executeImp`). Imp queries allow; node-edit modifications require the grant. Marloth-story has no authz ontology footprint (allow-everything solo); Denial coverage is test/fixture-only for now.

**Local IdP bindings (landed):** IdP Binding type table + Account↔Binding in the identity fixture; `ontology.json` `types.idpBinding`; claim → Account resolve via Imp→SQL on the session cache (same query layer as can-edit-nodes).

**Remaining:** Filtering (prefer query mutation); probing APIs; catch-all / specialized authorizers for other routes; fold or align `readonly` / `protectedNodeIds`; Role nodes / richer assignment; load policy Imp from Policy node bodies at runtime (today the can-edit-nodes / IdP-binding graphs are also built in code).

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [sso-login.md](./sso-login.md)
