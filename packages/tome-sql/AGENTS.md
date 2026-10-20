# tome-sql — agent notes

## What it is

Dialect-neutral **product** SQL IR and helpers for Tome (not Imp compile, not dialect drivers, not CacheSync). First resident: membership-query **Analyze** / **Plan** (Intent + layered order keys). Dialect packages (`tome-sqlite`, sibling `tome-postgres`) own Bind/Emit SQL text.

## Dependency rules

- Prefer **zero** runtime dependencies.
- Do **not** import `tome-sqlite`, `tome-db`, Imp packages, or dialect drivers.

## Layout

| Path | Role |
| --- | --- |
| `src/types.ts` | Intent / Plan / catalog / emitted shapes (`SqlParam` = `unknown`) |
| `src/analyze.ts` | `analyzeMemberPage` |
| `src/plan.ts` | `planMembershipQuery` |
| `src/helpers.ts` | Tokens, safe identifiers, relation-field JSON parse |
| `src/index.ts` | Public exports |

## Run

```bash
bun test   # from this package
```

## See also

- [views.md](../../docs/features/views.md) (member-page compiler)
- Package inventory [README.md](../README.md)
