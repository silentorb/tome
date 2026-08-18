# tome-sequencing-resolution

## Summary

**tome-sequencing-resolution** is the **layout engine** for relative event sequencing. It takes a `SequencingProblem` from `tome-sequencing-interfaces`, solves constraints (CPM-style earliest/latest windows), then packs ASAP schedules into non-overlapping concurrency lanes—similar in role to ELK / fcose for diagram blocks. It has no Tome or Imp dependencies.

## When to read this

- Changing constraint solving, placement packing, or diagnostics
- Understanding what `resolve` + `layoutEvents` guarantee for display

## Requirements

- Must import general sequencing vocabulary from `tome-sequencing-interfaces` only (events, depends, duration specs, problem).
- Must export resolution/layout types: `ResolvedEvent`, `LaidOutEvent`, `LayoutResult`, `ResolutionResult`, `ResolutionError`, `resolve`, and `layoutEvents`.
- Depends edges are hard finish-to-start unless overridden by parallel eligibility rules for non-edge pairs.
- Flex / omitted durations use `defaultDuration` as the minimum length; fixed numeric durations are exact.
- Cycles and unsatisfiable containment must fail with structured errors.
- Chronology units are abstract relative numbers (not calendar dates).
- **Exclusive placement** per event is the ASAP interval `[start, end) = [earliestStart, earliestEnd)`. Same-lane intervals must not overlap (abut OK). ALAP fields are slack metadata only—they must not claim lane space.

## Design rationale

Hosts specify relationships (and durations); this package **arranges** events automatically. Display should paint placements without a second, conflicting geometry pass. Keeping the package free of Tome/Imp lets other hosts reuse the same solver.

## Behavior / pipeline

1. Validate event ids and depends endpoints.
2. Build successor DAG from depends + implicit FS edges for non-parallel pairs.
3. Detect cycles.
4. Forward pass (earliest) and backward pass (latest).
5. Tighten children into parent windows when `parentIds` are set.
6. Return per-event windows via `resolve`.
7. `layoutEvents(resolved)` packs ASAP intervals into concurrency `lane`s → `LaidOutEvent[]`.

## Verification

```bash
bun run --filter tome-sequencing-resolution test
```

## See also

- [tome-sequencing.md](./tome-sequencing.md)
- Package [`tome-sequencing-resolution/AGENTS.md`](../../packages/tome-sequencing-resolution/AGENTS.md)
