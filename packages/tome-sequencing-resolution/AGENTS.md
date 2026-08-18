# tome-sequencing-resolution — agent notes

**Feature spec:** [`docs/features/tome-sequencing-resolution.md`](../../docs/features/tome-sequencing-resolution.md)

## Dependency rules

- Depends on `tome-sequencing-interfaces` only among Tome packages.
- Do **not** define general sequencing vocabulary here — import it from interfaces.
- No Tome/Imp runtime.
- `resolve` solves a start/end timepoint graph (`from` / `to` on each depends edge).

## Exports

- `resolve(problem) → ResolutionResult`
- `layoutEvents(resolved) → LayoutResult` (non-overlapping ASAP placements + lanes)
- `ResolvedEvent`, `LaidOutEvent`, `LayoutResult`, `ResolutionResult`, `ResolutionError`

## Run

```bash
bun test
```
