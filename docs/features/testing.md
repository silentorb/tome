# Testing (weighted tiers)

## Summary

Tome’s root `bun run test` (and release-image `test`) uses **weighted gating**:

| Tier | How marked | Gate effect |
| --- | --- | --- |
| **Critical** | Plain `test(...)` or `criticalTest(...)` | Any failure → suite fails |
| **Nonessential** | `nonessentialTest(...)` or `describeNonessential(...)` (name/classname prefix `[nonessential]`) | Always runs; failures tolerated while pass rate stays ≥ threshold (default **90%**), with a sparse-suite allowance of one failure before the tier has enough volume |

**Nonessential** means lower weight in the gate. It is **not** a skip flag, config toggle, or “optional suite you can turn off.”

Helpers and gate math live in [`tome-test-support`](../../packages/tome-test-support/). Orchestration: [`scripts/run-weighted-tests.ts`](../../scripts/run-weighted-tests.ts).

## When to read this

- Adding or changing UI / happy-dom tests
- Deciding whether a brittle case should be critical or nonessential
- Debugging CI gates after a nonessential cluster of failures

## Requirements

- Unmarked tests **must** be treated as critical.
- Prefer **critical** tests with deterministic assertions (roles/labels, mock call counts, elements that remain mounted).
- **Must not** add critical tests that are brittle or race-prone under happy-dom. Use `nonessentialTest` only when the coverage still adds value.
- Regression tests for bug fixes **remain critical** unless the user explicitly waives them — choose a robust assertion strategy.
- Do not invent alternate tier prefixes or use `test.skip` / `test.todo` as a substitute for nonessential weighting.

### Brittle patterns (prefer rewrite; else nonessential)

- `fireEvent` on a node whose handler synchronously unmounts that node (self-unmount during `act()` / `removeChild`)
- Hard-coded `setTimeout` sleeps instead of fake timers or stable `waitFor` conditions
- `waitFor` with async callbacks or mock-only assertions without DOM settlement
- Window/document keyboard listeners without guaranteed teardown
- Assertions that depend on happy-dom layout quirks (zero `clientWidth`, etc.)

### Follow-up audit candidates (do not bulk-reclassify casually)

| Area | Pattern |
| --- | --- |
| `App.create.test.tsx` | Long hard sleep for debounce |
| `GlobalSearch.test.tsx` | `fireEvent.keyDown(window)` |
| `page-block-expand.test.ts` | `setTimeout` + happy-dom size hacks |

## Design rationale

Bun has no native test tags. Name prefixes + JUnit output let CI tolerate a small amount of brittle GUI coverage without making “one flaky Escape test” block every release, while keeping critical regressions hard gates.

## Behavior / pipeline

1. Root typecheck (blocking).
2. Each package in the historical suite order runs `bun test --reporter=junit …` (package-level typecheck inside `"test"` scripts is skipped here; root typecheck already ran).
3. JUnit XML is classified: `[nonessential]` on testcase `name` or `classname` → nonessential; else critical.
4. Gate: critical failures → fail; else nonessential must meet the rate threshold (default 90%). **Sparse suites:** while fewer than `ceil(1 / (1 - rate))` nonessential cases have run (10 at 90%), a **single** nonessential failure is still allowed so one brittle case cannot hard-fail CI before the tier has volume.

`bun run test:raw` runs the old all-or-nothing sequential package script (every failure fails immediately) for debugging.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOME_TEST_NONESSENTIAL_PASS_RATE` | `0.90` | Minimum pass rate for executed nonessential tests |
| `TOME_TEST_JUNIT_DIR` | temp dir | Keep per-package JUnit XML when set |

## Quick start

```bash
# Weighted gate (local + CI / release image `test`)
bun run test

# Strict sequential packages (no weighted tolerance)
bun run test:raw

# Tier helpers
import { nonessentialTest, criticalTest } from "tome-test-support";
```

## Verification

- `bun run --filter tome-test-support test` — parser/gating unit tests
- Simulate: all critical pass + one nonessential fail among many → exit 0; any critical fail → exit 1
- Release: `docker run --network none … test` uses `bun run test` → weighted runner

## See also

- [`tome-test-support/AGENTS.md`](../../packages/tome-test-support/AGENTS.md)
- [`container.md`](./container.md) — offline `test` in release CI
- Root [`AGENTS.md`](../../AGENTS.md) — Robust UI testing
