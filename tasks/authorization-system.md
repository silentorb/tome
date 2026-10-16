# Authorization system

Status: open

## Intent

Define who can read or change which corpora, nodes, and operations once multi-user is enabled — without turning product policy into a core monolith.

## Notes

Charter: [multi-user.md](../docs/features/multi-user.md). **Phase 2** — skeletal LCD `authorize(principal, action, resource)` in core (allow/no-op when no authz provider / null principal). **Phase 9+** — specialized policies as authorization **extensions** (multiple strategies welcome). No core multi-user mode switch. Existing corpus `readonly` / `protectedNodeIds` should fold under or sit beside the LCD interface over time.

## See also

- [multi-user.md](../docs/features/multi-user.md)
- [multi-user-system.md](./multi-user-system.md)
- [sso-login.md](./sso-login.md)
