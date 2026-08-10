# tome-sequencing-resolution — agent notes

**Feature spec:** [`docs/features/tome-sequencing-resolution.md`](../../docs/features/tome-sequencing-resolution.md)

## Dependency rules

- Depends on `tome-sequencing-interfaces` only among Tome packages.
- Do **not** define general sequencing vocabulary here — import it from interfaces.
- No Tome/Imp runtime.

## Exports

- `resolve(problem) → ResolutionResult`
- `ResolvedEvent`, `ResolutionResult`, `ResolutionError` (resolution-only)

## Run

```bash
bun test
```
