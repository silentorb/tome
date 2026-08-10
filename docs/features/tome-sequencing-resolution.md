# tome-sequencing-resolution

## Summary

**tome-sequencing-resolution** is a pure constraint **resolution** engine for relative event sequencing. It takes a `SequencingProblem` from `tome-sequencing-interfaces` and produces earliest/latest possibility windows per event (CPM-style ASAP/ALAP), without Tome or Imp dependencies.

## When to read this

- Changing resolution algorithm, range semantics, or diagnostics
- Understanding what `resolve` guarantees vs layout/UI

## Requirements

- Must import general sequencing vocabulary from `tome-sequencing-interfaces` only (events, depends, duration specs, problem).
- Must export only resolution-specific types: `ResolvedEvent`, `ResolutionResult`, `ResolutionError`, and `resolve`.
- Depends edges are hard finish-to-start unless overridden by parallel eligibility rules for non-edge pairs.
- Flex / omitted durations use `defaultDuration` as the minimum length; fixed numeric durations are exact.
- Cycles and unsatisfiable containment must fail with structured errors.
- Chronology units are abstract relative numbers (not calendar dates).

## Design rationale

Surface language may say “arrange”; the package name emphasizes that this is a **resolution** engine over constraints. Keeping it free of Tome/Imp lets other hosts reuse the same solver.

## Behavior / pipeline

1. Validate event ids and depends endpoints.
2. Build successor DAG from depends + implicit FS edges for non-parallel pairs.
3. Detect cycles.
4. Forward pass (earliest) and backward pass (latest).
5. Tighten children into parent windows when `parentIds` are set.
6. Return per-event `{ earliestStart, latestStart, earliestEnd, latestEnd }`.

## Verification

```bash
bun run --filter tome-sequencing-resolution test
```

## See also

- [tome-sequencing.md](./tome-sequencing.md)
- Package [`tome-sequencing-resolution/AGENTS.md`](../../packages/tome-sequencing-resolution/AGENTS.md)
