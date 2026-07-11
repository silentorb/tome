# tome-graph-interfaces — agent notes

## What it is

**Domain DTOs + `TomeGraphServices`** — TypeScript types for node pages, database views, graph snapshots, workspace/schema/view files, and mutation result unions. No runtime graph logic and no HTTP.

## Dependency rules

- **No** dependencies on `tome-db`, `tome-editor`, `tome-static-site`, or other tome packages.
- Types only (plus trivial package smoke tests).
- `tome-db` implements/builds these shapes and re-exports them for existing `from "tome-db"` imports.

## Layout

| File | Contents |
| --- | --- |
| `src/graph-services.ts` | `TomeGraphServices`, `WorkspacePublic` |
| `src/*.ts` | DTOs extracted from tome-db (and public extension manifest types) |

## Run / test

```bash
bun test   # from this package
```

## See also

- [tome-db.md](../../docs/features/tome-db.md) — storage and query implementation
- [tome-editor.md](../../docs/features/tome-editor.md) — editor host that consumes graph services
