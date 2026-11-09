# tome-mir — agent notes

## What it is

**Imp sync fabric** for Tome’s Mir-style multi-store observe wiring: node catalog (`tome.sync.*`), handle-free store registry, `wireSyncGraph` / default graphs, `publishMutation`, opaque-id partial scopes, and portable source helpers.

## Dependency rules

- **May** depend on `imp-core-types`, `tome-service-interfaces` (incl. `/sync`), `tome-graph-interfaces`.
- **Must not** depend on `tome-db`, `tome-flatfile`, `tome-sqlite`, `tome-server`, `tome-editor`, or search packages.
- Host session open, CacheSync apply, flatfile path scopes, and git tip watch live in `tome-db` (`tome-db/sync-session`).

## Layout

| Path | Role |
| --- | --- |
| `src/node-registry.ts` | `tome.sync.store` / `tome.sync.gitWatch` catalog |
| `src/registry.ts` | Handle-free `DataStoreRegistry` / `OpenedSyncStore` |
| `src/wire.ts` | Install observe edges from Imp graph |
| `src/publish-mutation.ts` | Fan-out write + sink apply |
| `src/partial-scope.ts` | Opaque id → `SyncScope` builders |
| `src/source-read.ts` | `syncSourceFromQueryable` |
| `src/stub-endpoint.ts` | Test stub endpoint |

## Run / test

```bash
bun test   # from this package
```

## See also

- [tome-sync.md](../../docs/features/tome-sync.md) — host session + fabric overview
- Mir design specs (workbench `.mnt/mir/`) — language-neutral fabric requirements
